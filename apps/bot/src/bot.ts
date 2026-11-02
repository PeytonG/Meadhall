// SPDX-License-Identifier: AGPL-3.0-only
// The Meadhall bot. It works only in servers (spaces) whose admins listed it (Server Settings → Bots), and only
// does what those servers set up: onboarding (gives roles once someone finishes), welcome messages, auto-mod,
// and moderation commands. Everything it reads from other people is checked by the shared parsers, and every
// moderation action is checked against the asker's own rights in the server.
import {
    ClientEvent,
    RoomEvent,

    SyncState,
    createClient,
    type MatrixClient,
    type MatrixEvent,
    type Room,

} from "matrix-js-sdk";

import {
    AUTOMOD_EVENT,
    BOTS_EVENT,
    COMMANDS_EVENT,
    ONBOARDING_EVENT,
    ONBOARDING_RESPONSE_EVENT,
    automodViolation,
    parseAutomod,
    parseBots,
    parseCommandContent,
    parseCommandInput,
    parseCommands,
    parseOnboarding,
    parseOnboardingResponse,
    rolesForResponse,
    welcomeText,
    type CommandInvocation,
} from "../../web/src/core/bots/botProtocol.ts";
import { BOT_COMMANDS, HELP_TEXT, timeoutMinutes } from "./commands.ts";
import type { BotConfig } from "./config.ts";
import { grantRoles, powerLevel, setTimedOut, spaceChannels } from "./roles.ts";

const TIMEOUTS_ACCOUNT_DATA = "io.github.peytong.meadhall.bot.timeouts";
const COMMAND_COOLDOWN_MS = 2_000;
const WARNING_COOLDOWN_MS = 30_000;

interface TimeoutEntry {
    space: string;
    user: string;
    until: number;
}

type Log = (message: string, ...details: unknown[]) => void;

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export class MeadhallBot {
    private client!: MatrixClient;
    private readonly startedAt = Date.now();
    private readonly lastCommand = new Map<string, number>();
    private readonly lastWarning = new Map<string, number>();
    private timeoutTimer: NodeJS.Timeout | null = null;
    private readonly pendingInvites = new Set<string>();
    private readonly config: BotConfig;
    private readonly log: Log;

    public constructor(config: BotConfig, log: Log = (message, ...details) => console.log(`[meadhall-bot] ${message}`, ...details)) {
        this.config = config;
        this.log = log;
    }

    public get userId(): string {
        return this.client.getSafeUserId();
    }

    // Signs in as a new session each time (the encryption keys live in memory only) and removes the sessions of
    // earlier runs, so the account doesn't collect stale devices.
    public async start(): Promise<void> {
        const login = createClient({ baseUrl: this.config.homeserverUrl });
        const identifier = { type: "m.id.user", user: this.config.user };
        const session = await login.loginRequest({ type: "m.login.password", identifier, password: this.config.password, initial_device_display_name: this.config.deviceName });
        this.client = createClient({ baseUrl: this.config.homeserverUrl, userId: session.user_id, deviceId: session.device_id, accessToken: session.access_token });
        if (this.config.allowedInviters.length === 0) this.config.allowedInviters.push(session.user_id.slice(session.user_id.indexOf(":") + 1));
        await this.removeOldSessions(session.device_id);
        await this.client.initRustCrypto({ useIndexedDB: false });
        this.client.on(RoomEvent.MyMembership, (room, membership) => void this.onMyMembership(room, membership).catch((error) => this.log("membership", error)));
        this.client.on(RoomEvent.Timeline, (event, room, toStart, _removed, data) => {
            if (toStart || !room || !data?.liveEvent) return;
            void this.onEvent(event, room).catch((error) => this.log("event", error));
        });
        const ready = new Promise<void>((resolve) => {
            this.client.on(ClientEvent.Sync, (state) => {
                if (state === SyncState.Prepared) resolve();
            });
        });
        await this.client.startClient({ initialSyncLimit: 1 });
        await ready;
        this.log(`signed in as ${this.userId}`);
        for (const room of this.client.getRooms()) {
            if (room.getMyMembership() === "invite") await this.considerInvite(room);
        }
        for (const space of this.servers()) await this.setUpServer(space);
        this.timeoutTimer = setInterval(() => void this.endTimeouts().catch((error) => this.log("timeouts", error)), 30_000);
    }

    public async stop(): Promise<void> {
        if (this.timeoutTimer) clearInterval(this.timeoutTimer);
        this.client?.stopClient();
        await this.client?.logout(true).catch(() => undefined);
    }

    private async removeOldSessions(currentDevice: string): Promise<void> {
        const { devices } = await this.client.getDevices();
        const stale = devices.filter((device) => device.device_id !== currentDevice && device.display_name === this.config.deviceName).map((device) => device.device_id);
        if (stale.length === 0) return;
        const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: this.config.user }, password: this.config.password };
        await this.client
            .deleteMultipleDevices(stale)
            .catch((error: { data?: { session?: string } }) => this.client.deleteMultipleDevices(stale, { ...auth, session: error.data?.session } as never))
            .catch((error) => this.log("couldn't remove old sessions", error));
    }

    // --- Which rooms the bot works in ---

    private listsMe(space: Room): boolean {
        return parseBots(space.currentState.getStateEvents(BOTS_EVENT, "")?.getContent()).some((bot) => bot.userId === this.userId);
    }

    private servers(): Room[] {
        return this.client.getRooms().filter((room) => room.isSpaceRoom() && room.getMyMembership() === "join" && this.listsMe(room));
    }

    // The server a room belongs to (the room itself, or a space listing it as a channel), if it lists the bot.
    private serverOf(room: Room): Room | null {
        if (room.isSpaceRoom()) return this.listsMe(room) ? room : null;
        return this.servers().find((space) => spaceChannels(this.client, space).some((channel) => channel.roomId === room.roomId)) ?? null;
    }

    private async onMyMembership(room: Room, membership: string): Promise<void> {
        if (membership === "invite") await this.considerInvite(room);
    }

    // Joins rooms it's invited to, then (once their state is in) keeps only servers that list it and their
    // channels. A channel invite can come before the bot is in its server, so a room that isn't recognised yet is
    // checked again when a server is set up, and left if it still isn't one of theirs after a minute.
    private async considerInvite(room: Room): Promise<void> {
        // Only people allowed to use this bot can bring it in (by default, accounts on its own homeserver), so
        // strangers can't put it to work in their own servers.
        const inviter = room.getMember(this.userId)?.events.member?.getSender() ?? "";
        if (!this.mayInvite(inviter)) {
            this.log(`declined an invite to ${room.roomId} from ${inviter || "someone unknown"}`);
            await this.client.leave(room.roomId).catch(() => undefined);
            return;
        }
        this.log(`invited to ${room.roomId}`);
        await this.client.joinRoom(room.roomId);
        this.pendingInvites.add(room.roomId);
        setTimeout(() => void this.recheck(room.roomId), 3_000);
        setTimeout(() => {
            if (this.pendingInvites.delete(room.roomId)) void this.client.leave(room.roomId).catch(() => undefined);
        }, 60_000);
    }

    private mayInvite(inviter: string): boolean {
        const domain = inviter.slice(inviter.indexOf(":") + 1);
        if (!inviter.startsWith("@") || !domain) return false;
        return this.config.allowedInviters.some((allowed) => (allowed.startsWith("@") ? allowed === inviter : allowed === domain || allowed === "*"));
    }

    private isChannelOfMyServer(roomId: string): boolean {
        return this.servers().some((space) => space.currentState.getStateEvents("m.space.child").some((event) => event.getStateKey() === roomId));
    }

    private async recheck(roomId: string): Promise<void> {
        if (!this.pendingInvites.has(roomId)) return;
        const room = this.client.getRoom(roomId);
        if (!room || room.getMyMembership() !== "join") return;
        if (room.isSpaceRoom() && this.listsMe(room)) {
            this.pendingInvites.delete(roomId);
            await this.setUpServer(room).catch((error) => this.log("setup", error));
        } else if (this.isChannelOfMyServer(roomId)) {
            this.pendingInvites.delete(roomId);
        }
    }

    // Registers the commands, and catches up on onboarding answers sent while the bot was away.
    private async setUpServer(space: Room): Promise<void> {
        const mine = parseCommands(this.userId, space.currentState.getStateEvents(COMMANDS_EVENT, this.userId)?.getContent());
        const wanted = parseCommands(this.userId, { commands: BOT_COMMANDS });
        if (JSON.stringify(mine) !== JSON.stringify(wanted)) {
            await this.client.sendStateEvent(space.roomId, COMMANDS_EVENT as never, { commands: BOT_COMMANDS } as never, this.userId).catch((error) => this.log("couldn't register commands", error));
        }
        for (const roomId of [...this.pendingInvites]) await this.recheck(roomId);
        for (const event of space.currentState.getStateEvents(ONBOARDING_RESPONSE_EVENT)) {
            await this.handleOnboarding(space, event, false).catch((error) => this.log("onboarding", error));
        }
        this.log(`working in ${space.name} (${space.roomId})`);
    }

    // --- Events ---

    private async onEvent(event: MatrixEvent, room: Room): Promise<void> {
        if (event.getTs() < this.startedAt - 60_000) return;
        await this.client.decryptEventIfNeeded(event);
        const type = event.getType();
        if (process.env.MEADHALL_BOT_DEBUG) this.log(`event ${type} in ${room.roomId} from ${event.getSender()}`);
        if (type === BOTS_EVENT && room.isSpaceRoom() && this.listsMe(room)) {
            await this.setUpServer(room);
            return;
        }
        const space = this.serverOf(room);
        if (!space) return;
        if (type === ONBOARDING_RESPONSE_EVENT && room.roomId === space.roomId) {
            await this.handleOnboarding(space, event, true);
        } else if (type === "m.room.member" && room.roomId === space.roomId) {
            await this.handleJoin(space, event);
        } else if (type === "m.room.message" && event.getSender() !== this.userId && !event.isRedacted()) {
            if (await this.handleAutomod(space, room, event)) return;
            await this.handleCommand(space, room, event);
        }
    }

    // --- Onboarding and welcome ---

    private async handleOnboarding(space: Room, event: MatrixEvent, live: boolean): Promise<void> {
        const userId = event.getStateKey() ?? "";
        // Only the member themselves can answer (the homeserver enforces it for "@" keys; checked again).
        if (event.getSender() !== userId || space.getMember(userId)?.membership !== "join") return;
        const config = parseOnboarding(space.currentState.getStateEvents(ONBOARDING_EVENT, "")?.getContent());
        if (!config.enabled) return;
        const response = parseOnboardingResponse(event.getContent(), config);
        if (!response) return;
        const changed = await grantRoles(this.client, space, userId, rolesForResponse(config, response));
        if (changed) this.log(`onboarding: gave roles to ${userId} in ${space.roomId}`);
        if (live && config.welcome.enabled) await this.welcome(space, userId);
    }

    private async handleJoin(space: Room, event: MatrixEvent): Promise<void> {
        const userId = event.getStateKey() ?? "";
        const joined = event.getContent().membership === "join" && event.getPrevContent().membership !== "join";
        if (!joined || userId === this.userId) return;
        const config = parseOnboarding(space.currentState.getStateEvents(ONBOARDING_EVENT, "")?.getContent());
        // With onboarding, the welcome comes once they finish it.
        if (config.welcome.enabled && !config.enabled) await this.welcome(space, userId);
    }

    private async welcome(space: Room, userId: string): Promise<void> {
        const config = parseOnboarding(space.currentState.getStateEvents(ONBOARDING_EVENT, "")?.getContent());
        const channel = config.welcome.channelId ? this.client.getRoom(config.welcome.channelId) : null;
        if (!channel || !spaceChannels(this.client, space).some((room) => room.roomId === channel.roomId)) return;
        const name = space.getMember(userId)?.name ?? userId;
        const text = welcomeText(config, name);
        const pill = `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${escapeHtml(name)}</a>`;
        await this.client.sendMessage(channel.roomId, {
            msgtype: "m.text",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: escapeHtml(welcomeText(config, "\u0000")).replace("\u0000", pill),
            "m.mentions": { user_ids: [userId] },
        } as never);
    }

    // --- Auto-mod ---

    // Returns whether the message was removed.
    private async handleAutomod(space: Room, room: Room, event: MatrixEvent): Promise<boolean> {
        const config = parseAutomod(space.currentState.getStateEvents(AUTOMOD_EVENT, "")?.getContent());
        const sender = event.getSender() ?? "";
        if (!config.enabled || powerLevel(space, sender) >= config.exemptRank || this.isBot(space, sender)) return false;
        const content = event.getContent();
        const body = typeof content.body === "string" ? content.body : "";
        const mentioned = Array.isArray(content["m.mentions"]?.user_ids) ? content["m.mentions"].user_ids.length : 0;
        const reason = automodViolation(body, mentioned, config);
        if (!reason) return false;
        await this.client.redactEvent(room.roomId, event.getId()!, undefined, { reason: `Auto-mod: ${reason}` });
        this.log(`auto-mod removed a message from ${sender} in ${room.roomId} (${reason})`);
        if (config.action === "delete") return true;
        if (config.action === "timeout") await this.timeOut(space, sender, config.timeoutMinutes);
        const key = `${room.roomId}|${sender}`;
        if (Date.now() - (this.lastWarning.get(key) ?? 0) > WARNING_COOLDOWN_MS) {
            this.lastWarning.set(key, Date.now());
            const after = config.action === "timeout" ? ` You can talk again in ${config.timeoutMinutes} minutes.` : "";
            await this.notice(room, `${space.getMember(sender)?.name ?? sender}, your message was removed: it had ${reason}.${after}`, [sender]);
        }
        return true;
    }

    private isBot(space: Room, userId: string): boolean {
        return parseBots(space.currentState.getStateEvents(BOTS_EVENT, "")?.getContent()).some((bot) => bot.userId === userId);
    }

    // --- Commands ---

    private parseCommand(event: MatrixEvent): CommandInvocation | null {
        const content = event.getContent();
        const structured = parseCommandContent(content);
        if (structured) return structured.bot === this.userId ? structured : null;
        // Typed in another app: "!warn @bob:example.org spamming".
        const body = typeof content.body === "string" ? content.body : "";
        if (!body.startsWith("!")) return null;
        return parseCommandInput(`/${body.slice(1)}`, parseCommands(this.userId, { commands: BOT_COMMANDS }));
    }

    private async handleCommand(space: Room, room: Room, event: MatrixEvent): Promise<void> {
        const command = this.parseCommand(event);
        if (!command) return;
        const sender = event.getSender() ?? "";
        if (Date.now() - (this.lastCommand.get(sender) ?? 0) < COMMAND_COOLDOWN_MS) return;
        this.lastCommand.set(sender, Date.now());
        // Structured args come from the sender's app: check them like typed ones.
        const known = parseCommands(this.userId, { commands: BOT_COMMANDS }).find((candidate) => candidate.name === command.name);
        if (!known) return;
        const args = command.args;
        switch (command.name) {
            case "help":
                await this.notice(room, HELP_TEXT);
                return;
            case "rules": {
                const config = parseOnboarding(space.currentState.getStateEvents(ONBOARDING_EVENT, "")?.getContent());
                await this.notice(room, config.rules.length ? config.rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n") : "This server hasn't written its rules yet.");
                return;
            }
        }
        const target = args.user ?? "";
        const problem = this.moderationProblem(space, sender, target, command.name === "ban" ? "ban" : "kick");
        if (problem) {
            await this.notice(room, problem, [sender]);
            return;
        }
        const targetName = space.getMember(target)?.name ?? target;
        const reason = (args.reason ?? "").slice(0, 300);
        switch (command.name) {
            case "warn":
                await this.notice(room, `${targetName}, you've been warned by a moderator${reason ? `: ${reason}` : "."}`, [target]);
                return;
            case "timeout": {
                const minutes = timeoutMinutes(args.minutes);
                await this.timeOut(space, target, minutes);
                await this.notice(room, `${targetName} can't talk for ${minutes} minutes${reason ? `: ${reason}` : "."}`, [target]);
                return;
            }
            case "untimeout":
                await this.endTimeout(space, target);
                await this.notice(room, `${targetName} can talk again.`, [target]);
                return;
            case "kick":
            case "ban": {
                for (const channel of [...spaceChannels(this.client, space), space]) {
                    const action = command.name === "ban" ? this.client.ban(channel.roomId, target, reason || undefined) : this.client.kick(channel.roomId, target, reason || undefined);
                    await action.catch(() => undefined);
                }
                await this.notice(room, `${targetName} was ${command.name === "ban" ? "banned" : "removed"}${reason ? `: ${reason}` : "."}`);
                return;
            }
        }
    }

    // Why a moderator can't do this to someone (null = they can): they need the server's kick/ban level, and the
    // target must rank below both them and the bot.
    private moderationProblem(space: Room, sender: string, target: string, action: "kick" | "ban"): string | null {
        const levels = (space.currentState.getStateEvents("m.room.power_levels", "")?.getContent() ?? {}) as Record<string, unknown>;
        const needed = typeof levels[action] === "number" ? (levels[action] as number) : 50;
        const senderLevel = powerLevel(space, sender);
        if (senderLevel < needed) return "Only moderators can do that.";
        if (!target || space.getMember(target)?.membership !== "join") return "They aren't in this server.";
        if (target === this.userId || target === sender) return "You can't do that to yourself or to me.";
        if (powerLevel(space, target) >= senderLevel) return "You can only do that to people ranked below you.";
        if (powerLevel(space, target) >= powerLevel(space, this.userId)) return "I can only do that to people ranked below me.";
        return null;
    }

    // --- Timeouts (kept in the bot's account data, so a restart still ends them) ---

    private readTimeouts(): TimeoutEntry[] {
        const entries = this.client.getAccountData(TIMEOUTS_ACCOUNT_DATA as never)?.getContent()?.entries;
        return Array.isArray(entries) ? entries.filter((entry): entry is TimeoutEntry => typeof entry?.space === "string" && typeof entry?.user === "string" && typeof entry?.until === "number") : [];
    }

    private async writeTimeouts(entries: TimeoutEntry[]): Promise<void> {
        await this.client.setAccountData(TIMEOUTS_ACCOUNT_DATA as never, { entries } as never);
    }

    private async timeOut(space: Room, userId: string, minutes: number): Promise<void> {
        await setTimedOut(this.client, space, userId, true);
        const others = this.readTimeouts().filter((entry) => !(entry.space === space.roomId && entry.user === userId));
        await this.writeTimeouts([...others, { space: space.roomId, user: userId, until: Date.now() + minutes * 60_000 }]);
    }

    private async endTimeout(space: Room, userId: string): Promise<void> {
        await setTimedOut(this.client, space, userId, false);
        await this.writeTimeouts(this.readTimeouts().filter((entry) => !(entry.space === space.roomId && entry.user === userId)));
    }

    private async endTimeouts(): Promise<void> {
        for (const entry of this.readTimeouts()) {
            if (entry.until > Date.now()) continue;
            const space = this.client.getRoom(entry.space);
            if (space) await this.endTimeout(space, entry.user);
            else await this.writeTimeouts(this.readTimeouts().filter((other) => other !== entry));
        }
    }

    private async notice(room: Room, text: string, mention: string[] = []): Promise<void> {
        await this.client.sendMessage(room.roomId, { msgtype: "m.notice", body: text, "m.mentions": { user_ids: mention } } as never);
    }
}
