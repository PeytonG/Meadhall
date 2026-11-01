// SPDX-License-Identifier: AGPL-3.0-only
// A demo community on the local test homeserver (scripts/test-synapse.mjs), to look around Meadhall by hand:
//   node scripts/demo-hall.mjs            then sign in as  demo / meadhall-demo  at http://localhost:8008
// It makes (once; running it again reuses everything):
// - "Mead Hall", a server you own: channels with messages, a poll, a thread, code, roles, and the Meadhall bot;
// - "Bot Hall", someone else's server with onboarding: you see it as a new member does;
// - DMs and a group chat.
// Only for the local test server: the passwords below are not secret.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HS = process.env.SYNAPSE_URL ?? "http://localhost:8008";
const PASSWORD = "meadhall-demo";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function call(user, method, route, body) {
    const response = await fetch(`${HS}/_matrix/client/v3${route}`, {
        method,
        headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text}`);
    return text ? JSON.parse(text) : {};
}

async function account(username, displayName) {
    const login = () =>
        call(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user: username }, password: PASSWORD });
    let session;
    try {
        session = await call(null, "POST", "/register", { username, password: PASSWORD, auth: { type: "m.login.dummy" }, initial_device_display_name: "demo setup" });
    } catch {
        session = await login();
    }
    const user = { id: session.user_id, token: session.access_token, username, name: displayName };
    await call(user, "PUT", `/profile/${encodeURIComponent(user.id)}/displayname`, { displayname: displayName });
    return user;
}

const state = (user, room, type, key, content) => call(user, "PUT", `/rooms/${encodeURIComponent(room)}/state/${type}/${encodeURIComponent(key)}`, content);
const send = (user, room, content, type = "m.room.message") => call(user, "PUT", `/rooms/${encodeURIComponent(room)}/send/${type}/${crypto.randomUUID()}`, content).then((r) => r.event_id);
const say = (user, room, body) => send(user, room, { msgtype: "m.text", body });
const join = (user, room) => call(user, "POST", `/join/${encodeURIComponent(room)}`, {});
const accountData = (user, type, content) => call(user, "PUT", `/user/${encodeURIComponent(user.id)}/account_data/${type}`, content);

async function existing(user, name) {
    const { joined_rooms: rooms } = await call(user, "GET", "/joined_rooms");
    for (const room of rooms) {
        const roomName = await call(user, "GET", `/rooms/${encodeURIComponent(room)}/state/m.room.name/`).catch(() => ({}));
        if (roomName.name === name) return room;
    }
    return null;
}

async function server(owner, name, members, channels) {
    const found = await existing(owner, name);
    if (found) return { spaceId: found, channels: null };
    const spaceId = (await call(owner, "POST", "/createRoom", { name, preset: "private_chat", creation_content: { type: "m.space" }, invite: members.map((m) => m.id) })).room_id;
    const ids = {};
    for (const [key, channelName, extra] of channels) {
        ids[key] = (
            await call(owner, "POST", "/createRoom", {
                name: channelName,
                preset: "private_chat",
                invite: members.map((m) => m.id),
                initial_state: [{ type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } }, ...(extra ?? [])],
            })
        ).room_id;
        await state(owner, spaceId, "m.space.child", ids[key], { via: ["localhost"], suggested: true });
    }
    return { spaceId, channels: ids };
}

const demo = await account("demo", "Demo Viking");
const hrothgar = await account("demo-hrothgar", "Hrothgar");
const wealhtheow = await account("demo-wealhtheow", "Wealhtheow");
const wiglaf = await account("demo-wiglaf", "Wiglaf");
const bot = await account("demo-hallbot", "Hall Bot");
const friends = [hrothgar, wealhtheow, wiglaf];

// --- Mead Hall: your own server ---
const mead = await server(demo, "Mead Hall", [...friends, bot], [
    ["general", "general"],
    ["announcements", "announcements"],
    ["tavern", "the-tavern"],
    ["voice", "Great Hall", [{ type: "com.heorot.voice_channel", state_key: "", content: { enabled: true } }]],
]);
if (mead.channels) {
    for (const friend of friends) {
        await join(friend, mead.spaceId);
        for (const room of Object.values(mead.channels)) await join(friend, room);
    }
    await state(demo, mead.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "role_jarl", name: "Jarl", color: "#e67e22", rank: 80, permissions: ["manage_server", "manage_channels", "manage_roles", "kick", "ban", "manage_messages", "pin_messages"] },
            { id: "role_bot", name: "Bots", color: "#5865f2", rank: 60, permissions: ["manage_roles", "kick", "ban", "manage_messages"] },
            { id: "role_thane", name: "Thane", color: "#2ecc71", rank: 20, permissions: ["pin_messages"] },
            { id: "role_member", name: "Member", color: "#99aab5", rank: 1, permissions: [] },
        ],
    });
    for (const [user, roles] of [[hrothgar, ["role_jarl"]], [wealhtheow, ["role_thane"]], [wiglaf, ["role_member"]]]) {
        await state(demo, mead.spaceId, "io.github.peytong.meadhall.member_roles", `user:${user.id}`, { roles });
    }
    const general = mead.channels.general;
    await say(hrothgar, general, "Welcome to Mead Hall! The fire's lit and the mead is poured. 🍺");
    await say(wealhtheow, general, "Evening all. Who's up for a song later?");
    const question = await say(wiglaf, general, "Anyone know how to tune the harp? It's been off since the feast.");
    await send(hrothgar, general, {
        msgtype: "m.text",
        body: "Try this, it's what the skalds use",
        "m.relates_to": { rel_type: "m.thread", event_id: question, is_falling_back: true, "m.in_reply_to": { event_id: question } },
    });
    await send(wealhtheow, general, {
        msgtype: "m.text",
        body: "Tighten the third string first, then tune down from there.",
        "m.relates_to": { rel_type: "m.thread", event_id: question, is_falling_back: true, "m.in_reply_to": { event_id: question } },
    });
    await say(wiglaf, general, "Here's the feast schedule script:\n```ts\nconst courses = [\"bread\", \"boar\", \"honey cakes\"];\nfor (const course of courses) serve(course);\n```");
    await send(hrothgar, general, {
        "org.matrix.msc3381.poll.start": {
            kind: "org.matrix.msc3381.poll.disclosed",
            max_selections: 1,
            question: { "org.matrix.msc1767.text": "What's for the feast?" },
            answers: [
                { id: "boar", "org.matrix.msc1767.text": "Roast boar" },
                { id: "fish", "org.matrix.msc1767.text": "Smoked fish" },
                { id: "stew", "org.matrix.msc1767.text": "Stew" },
            ],
        },
        "org.matrix.msc1767.text": "What's for the feast?\n1. Roast boar\n2. Smoked fish\n3. Stew",
    }, "org.matrix.msc3381.poll.start");
    await say(hrothgar, mead.channels.announcements, "📜 The hall opens at dusk. Bring your own horn.");
    await say(wealhtheow, mead.channels.tavern, "Tavern's open. First round is on Wiglaf.");
    await say(wiglaf, mead.channels.tavern, "It is NOT.");
    // The bot, with its role (the running bot joins and registers its commands).
    await state(demo, mead.spaceId, "io.github.peytong.meadhall.bots", "", { bots: { [bot.id]: { added_by: demo.id, added_at: Date.now() } } });
    await state(demo, mead.spaceId, "io.github.peytong.meadhall.member_roles", `user:${bot.id}`, { roles: ["role_bot"] });
    const levels = await call(demo, "GET", `/rooms/${encodeURIComponent(mead.spaceId)}/state/m.room.power_levels/`);
    await state(demo, mead.spaceId, "m.room.power_levels", "", {
        ...levels,
        users: { ...levels.users, [hrothgar.id]: 80, [wealhtheow.id]: 20, [wiglaf.id]: 1, [bot.id]: 60 },
        events: { ...levels.events, "io.github.peytong.meadhall.commands": 0, "io.github.peytong.meadhall.onboarding.response": 0 },
    });
    for (const room of Object.values(mead.channels)) {
        const channelLevels = await call(demo, "GET", `/rooms/${encodeURIComponent(room)}/state/m.room.power_levels/`);
        await state(demo, room, "m.room.power_levels", "", { ...channelLevels, users: { ...channelLevels.users, [bot.id]: 60 }, redact: 50, kick: 50 });
    }
    await state(demo, mead.spaceId, "io.github.peytong.meadhall.automod", "", { enabled: true, blocked_words: ["grog"], block_links: false, max_mentions: 5, action: "warn", timeout_minutes: 10, exempt_rank: 50 });
}

// --- Bot Hall: someone else's server, where you're new and go through onboarding ---
const botHall = await server(hrothgar, "Bot Hall", [demo, wealhtheow, bot], [["lobby", "lobby"], ["quests", "quests"]]);
if (botHall.channels) {
    await join(wealhtheow, botHall.spaceId);
    for (const room of Object.values(botHall.channels)) await join(wealhtheow, room);
    await state(hrothgar, botHall.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "role_bot", name: "Bots", color: "#5865f2", rank: 60, permissions: ["manage_roles", "kick", "ban", "manage_messages"] },
            { id: "role_warrior", name: "Warriors", color: "#e74c3c", rank: 3, permissions: [] },
            { id: "role_bard", name: "Bards", color: "#9b59b6", rank: 2, permissions: [] },
            { id: "role_member", name: "Member", color: "#99aab5", rank: 1, permissions: [] },
        ],
    });
    await state(hrothgar, botHall.spaceId, "io.github.peytong.meadhall.bots", "", { bots: { [bot.id]: { added_by: hrothgar.id, added_at: Date.now() } } });
    await state(hrothgar, botHall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${bot.id}`, { roles: ["role_bot"] });
    await state(hrothgar, botHall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${wealhtheow.id}`, { roles: ["role_member", "role_bard"] });
    await state(hrothgar, botHall.spaceId, "io.github.peytong.meadhall.onboarding", "", {
        enabled: true,
        intro: "Welcome, traveller! Bot Hall is where we test the hall's bot. Read the rules and tell us about yourself.",
        rules: ["Be kind to fellow travellers", "No spam or advertising", "Keep quests in #quests"],
        questions: [
            { id: "path", prompt: "Which path do you walk?", multiple: false, required: true, answers: [{ id: "sword", label: "⚔️ The sword", role_id: "role_warrior" }, { id: "song", label: "🎶 The song", role_id: "role_bard" }] },
            { id: "games", prompt: "What do you like to play?", multiple: true, required: false, answers: [{ id: "rpg", label: "RPGs" }, { id: "strategy", label: "Strategy" }, { id: "cozy", label: "Cozy games" }] },
        ],
        member_role_id: "role_member",
        gate: "enforced",
        welcome: { enabled: true, channel_id: botHall.channels.lobby, message: "Welcome to Bot Hall, {user}! 🍻" },
    });
    for (const [key, room] of Object.entries(botHall.channels)) {
        const channelLevels = await call(hrothgar, "GET", `/rooms/${encodeURIComponent(room)}/state/m.room.power_levels/`);
        await state(hrothgar, room, "m.room.power_levels", "", {
            ...channelLevels,
            events_default: 1,
            users: { ...channelLevels.users, [bot.id]: 60, [wealhtheow.id]: 2 },
        });
        await state(hrothgar, room, "io.github.peytong.meadhall.channel_view", "", { talk: "role_member" });
        if (key === "lobby") await say(wealhtheow, room, "Hello from the lobby! Finish onboarding and the bot will let you in.");
    }
    const spaceLevels = await call(hrothgar, "GET", `/rooms/${encodeURIComponent(botHall.spaceId)}/state/m.room.power_levels/`);
    await state(hrothgar, botHall.spaceId, "m.room.power_levels", "", {
        ...spaceLevels,
        users: { ...spaceLevels.users, [bot.id]: 60, [wealhtheow.id]: 2 },
        events: { ...spaceLevels.events, "io.github.peytong.meadhall.commands": 0, "io.github.peytong.meadhall.onboarding.response": 0 },
    });
}

// --- DMs and a group chat ---
if (!(await existing(demo, "Shieldwall"))) {
    const dm = (await call(hrothgar, "POST", "/createRoom", { is_direct: true, preset: "trusted_private_chat", invite: [demo.id] })).room_id;
    await join(demo, dm);
    await say(hrothgar, dm, "Good to see you in the hall. Did you try the new bot yet? Type / in a channel.");
    const dm2 = (await call(wealhtheow, "POST", "/createRoom", { is_direct: true, preset: "trusted_private_chat", invite: [demo.id] })).room_id;
    await join(demo, dm2);
    await say(wealhtheow, dm2, "Saved you a seat by the fire 🔥");
    await accountData(demo, "m.direct", { [hrothgar.id]: [dm], [wealhtheow.id]: [dm2] });
    const group = (await call(wiglaf, "POST", "/createRoom", { name: "Shieldwall", preset: "private_chat", invite: [demo.id, hrothgar.id] })).room_id;
    await join(demo, group);
    await join(hrothgar, group);
    await say(wiglaf, group, "Training at dawn, shields up.");
    await say(hrothgar, group, "I'll bring the mead for after.");
}

// Pending invites for the demo account are accepted by Meadhall itself (it auto-joins server invites).
console.log(`Demo ready on ${HS}. Sign in as:  demo  /  ${PASSWORD}`);

// Keep the bot running (Ctrl+C to stop), unless asked not to.
if (!process.argv.includes("--no-bot")) {
    const child = spawn(process.execPath, ["src/main.ts"], {
        cwd: path.join(root, "apps", "bot"),
        env: { ...process.env, MEADHALL_BOT_HOMESERVER: HS, MEADHALL_BOT_USER: bot.username, MEADHALL_BOT_PASSWORD: PASSWORD },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => String(chunk).split("\n").filter((line) => line.includes("[meadhall-bot]")).forEach((line) => console.log(line)));
    child.on("exit", (code) => process.exit(code ?? 0));
    process.on("SIGINT", () => child.kill());
}
