// SPDX-License-Identifier: AGPL-3.0-only
// Server bots, Discord-style, on Matrix: which accounts are a server's bots, the slash commands they offer, the
// server's onboarding (rules and questions new members answer before talking), and its auto-mod rules. Shared by
// the app and the Meadhall bot (apps/bot), so both read and check everything the same way.
//
// Everything is state in the server's space room, so the homeserver decides who may change it:
// - BOTS_EVENT ("" key): the bot list. Server admins only (the room's state level).
// - COMMANDS_EVENT (key = the bot's user ID): a bot's commands. Keys starting with "@" can only be sent by that
//   user, so a bot can only describe its own commands; the app shows commands only for listed bots.
// - ONBOARDING_EVENT, AUTOMOD_EVENT ("" key): set by admins in Server Settings.
// - ONBOARDING_RESPONSE_EVENT (key = the member's user ID): a member's answers, sent by that member.
// Nothing here is trusted beyond what the parsers below accept: names, lengths and counts are capped, unknown
// fields dropped, and answers checked against the server's own questions.

export const BOTS_EVENT = "io.github.peytong.meadhall.bots";
export const COMMANDS_EVENT = "io.github.peytong.meadhall.commands";
export const ONBOARDING_EVENT = "io.github.peytong.meadhall.onboarding";
export const ONBOARDING_RESPONSE_EVENT = "io.github.peytong.meadhall.onboarding.response";
export const AUTOMOD_EVENT = "io.github.peytong.meadhall.automod";
// In a message: the slash command it runs, for the bot (the body keeps the typed text for everyone else).
export const COMMAND_CONTENT_KEY = "io.github.peytong.meadhall.command";

const MAX_BOTS = 25;
const MAX_COMMANDS = 50;
const MAX_OPTIONS = 10;
const MAX_CHOICES = 25;
const MAX_RULES = 20;
const MAX_QUESTIONS = 10;
const MAX_ANSWERS = 12;
const MAX_WORDS = 200;

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Plain text, control and bidirectional-override characters removed, trimmed and capped.
export function cleanText(value: unknown, max: number): string {
    if (typeof value !== "string") return "";
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, max);
}

const USER_ID = /^@[a-z0-9._=\-/+]+:[a-z0-9.\-:[\]]+$/i;

export function isUserId(value: unknown): value is string {
    return typeof value === "string" && value.length <= 255 && USER_ID.test(value);
}

// --- Bots ---

export interface BotEntry {
    userId: string;
    addedBy?: string;
    addedAt?: number;
}

export function parseBots(content: unknown): BotEntry[] {
    if (!isObject(content) || !isObject(content.bots)) return [];
    return Object.entries(content.bots)
        .filter(([userId, entry]) => isUserId(userId) && isObject(entry))
        .slice(0, MAX_BOTS)
        .map(([userId, entry]) => {
            const record = entry as Record<string, unknown>;
            return {
                userId,
                ...(isUserId(record.added_by) ? { addedBy: record.added_by } : {}),
                ...(typeof record.added_at === "number" ? { addedAt: record.added_at } : {}),
            };
        });
}

export function botsContent(bots: BotEntry[]): Record<string, unknown> {
    return {
        bots: Object.fromEntries(
            bots.map((bot) => [bot.userId, { ...(bot.addedBy ? { added_by: bot.addedBy } : {}), ...(bot.addedAt ? { added_at: bot.addedAt } : {}) }]),
        ),
    };
}

// --- Slash commands ---

export type CommandOptionType = "text" | "user" | "number" | "choice";

export interface CommandOption {
    name: string;
    description: string;
    type: CommandOptionType;
    required: boolean;
    choices?: string[];
}

export interface BotCommand {
    bot: string;
    name: string;
    description: string;
    options: CommandOption[];
}

const COMMAND_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const OPTION_TYPES = new Set<CommandOptionType>(["text", "user", "number", "choice"]);

export function parseCommands(bot: string, content: unknown): BotCommand[] {
    if (!isUserId(bot) || !isObject(content) || !Array.isArray(content.commands)) return [];
    const seen = new Set<string>();
    const commands: BotCommand[] = [];
    for (const raw of content.commands.slice(0, MAX_COMMANDS)) {
        if (!isObject(raw) || typeof raw.name !== "string") continue;
        const name = raw.name.toLowerCase();
        if (!COMMAND_NAME.test(name) || seen.has(name)) continue;
        seen.add(name);
        const options: CommandOption[] = [];
        const optionNames = new Set<string>();
        for (const option of Array.isArray(raw.options) ? raw.options.slice(0, MAX_OPTIONS) : []) {
            if (!isObject(option) || typeof option.name !== "string") continue;
            const optionName = option.name.toLowerCase();
            if (!COMMAND_NAME.test(optionName) || optionNames.has(optionName)) continue;
            optionNames.add(optionName);
            const type = OPTION_TYPES.has(option.type as CommandOptionType) ? (option.type as CommandOptionType) : "text";
            const choices =
                type === "choice" && Array.isArray(option.choices)
                    ? option.choices.map((choice) => cleanText(choice, 32)).filter(Boolean).slice(0, MAX_CHOICES)
                    : undefined;
            options.push({
                name: optionName,
                description: cleanText(option.description, 100),
                type: type === "choice" && !choices?.length ? "text" : type,
                required: option.required === true,
                ...(choices?.length ? { choices } : {}),
            });
        }
        commands.push({ bot, name, description: cleanText(raw.description, 100), options });
    }
    return commands;
}

export interface CommandInvocation {
    bot: string;
    name: string;
    // Option name → value as typed (user options as user IDs).
    args: Record<string, string>;
}

// "/warn @bob:example.org spamming links" → the command and its options: one word per option in order, the last
// text option taking the rest of the line. null when the text isn't one of the commands, or a required option is
// missing or invalid. When two bots offer the same name, the first listed wins (the menu shows which bot).
export function parseCommandInput(text: string, commands: BotCommand[], bot?: string): CommandInvocation | null {
    const match = /^\/([a-z0-9][a-z0-9_-]{0,31})(?:\s+([\s\S]*))?$/i.exec(text.trim());
    if (!match) return null;
    const name = match[1]!.toLowerCase();
    const command = commands.find((candidate) => candidate.name === name && (!bot || candidate.bot === bot));
    if (!command) return null;
    let rest = (match[2] ?? "").trim();
    const args: Record<string, string> = {};
    command.options.forEach((option, index) => {
        if (!rest) return;
        const last = index === command.options.length - 1;
        let value: string;
        if (last && option.type === "text") {
            value = rest;
            rest = "";
        } else {
            const word = /^(\S+)\s*([\s\S]*)$/.exec(rest)!;
            value = word[1]!;
            rest = word[2]!;
        }
        args[option.name] = value;
    });
    for (const option of command.options) {
        const value = args[option.name];
        if (value === undefined) {
            if (option.required) return null;
            continue;
        }
        if (option.type === "user" && !isUserId(value)) return null;
        if (option.type === "number" && !Number.isFinite(Number(value))) return null;
        if (option.type === "choice" && !option.choices?.includes(value)) return null;
        args[option.name] = value.slice(0, 1000);
    }
    return { bot: command.bot, name: command.name, args };
}

// What the bot accepts from a message (sent by anyone, so checked again here).
export function parseCommandContent(content: unknown): CommandInvocation | null {
    if (!isObject(content)) return null;
    const command = content[COMMAND_CONTENT_KEY];
    if (!isObject(command) || !isUserId(command.bot) || typeof command.name !== "string" || !COMMAND_NAME.test(command.name)) return null;
    const args: Record<string, string> = {};
    if (isObject(command.args)) {
        for (const [key, value] of Object.entries(command.args).slice(0, MAX_OPTIONS)) {
            if (COMMAND_NAME.test(key) && typeof value === "string") args[key] = value.slice(0, 1000);
        }
    }
    return { bot: command.bot, name: command.name, args };
}

// --- Onboarding ---

export interface OnboardingAnswer {
    id: string;
    label: string;
    // A role given to members who pick this answer.
    roleId?: string;
}

export interface OnboardingQuestion {
    id: string;
    prompt: string;
    multiple: boolean;
    required: boolean;
    answers: OnboardingAnswer[];
}

export interface OnboardingConfig {
    enabled: boolean;
    // Shown above the rules.
    intro: string;
    rules: string[];
    questions: OnboardingQuestion[];
    // The role given to everyone who finishes onboarding (and, with "enforced", the role needed to talk).
    memberRoleId: string | null;
    // soft: Meadhall asks new members to finish onboarding before they write; enforced: channels only let members
    // with memberRoleId talk, and a bot gives that role once someone finishes.
    gate: "soft" | "enforced";
    welcome: { enabled: boolean; channelId: string | null; message: string };
}

const ID = /^[a-z0-9_-]{1,40}$/i;

export const DEFAULT_ONBOARDING: OnboardingConfig = {
    enabled: false,
    intro: "",
    rules: [],
    questions: [],
    memberRoleId: null,
    gate: "soft",
    welcome: { enabled: false, channelId: null, message: "Welcome to the hall, {user}!" },
};

export function parseOnboarding(content: unknown): OnboardingConfig {
    if (!isObject(content)) return DEFAULT_ONBOARDING;
    const questions: OnboardingQuestion[] = [];
    for (const raw of Array.isArray(content.questions) ? content.questions.slice(0, MAX_QUESTIONS) : []) {
        if (!isObject(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) continue;
        const answers = (Array.isArray(raw.answers) ? raw.answers.slice(0, MAX_ANSWERS) : [])
            .filter(isObject)
            .filter((answer) => typeof answer.id === "string" && ID.test(answer.id))
            .map((answer) => ({
                id: answer.id as string,
                label: cleanText(answer.label, 80) || "Answer",
                ...(typeof answer.role_id === "string" && ID.test(answer.role_id) ? { roleId: answer.role_id } : {}),
            }));
        const prompt = cleanText(raw.prompt, 200);
        if (!prompt || answers.length === 0) continue;
        questions.push({ id: raw.id, prompt, multiple: raw.multiple === true, required: raw.required !== false, answers });
    }
    const welcome = isObject(content.welcome) ? content.welcome : {};
    return {
        enabled: content.enabled === true,
        intro: cleanText(content.intro, 1000),
        rules: (Array.isArray(content.rules) ? content.rules : []).map((rule) => cleanText(rule, 300)).filter(Boolean).slice(0, MAX_RULES),
        questions,
        memberRoleId: typeof content.member_role_id === "string" && ID.test(content.member_role_id) ? content.member_role_id : null,
        gate: content.gate === "enforced" ? "enforced" : "soft",
        welcome: {
            enabled: welcome.enabled === true,
            channelId: typeof welcome.channel_id === "string" && /^![^\s]{1,255}$/.test(welcome.channel_id) ? welcome.channel_id : null,
            message: cleanText(welcome.message, 500) || DEFAULT_ONBOARDING.welcome.message,
        },
    };
}

export function onboardingContent(config: OnboardingConfig): Record<string, unknown> {
    return {
        enabled: config.enabled,
        intro: config.intro,
        rules: config.rules,
        questions: config.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            multiple: question.multiple,
            required: question.required,
            answers: question.answers.map((answer) => ({ id: answer.id, label: answer.label, ...(answer.roleId ? { role_id: answer.roleId } : {}) })),
        })),
        member_role_id: config.memberRoleId,
        gate: config.gate,
        welcome: { enabled: config.welcome.enabled, channel_id: config.welcome.channelId, message: config.welcome.message },
    };
}

export interface OnboardingResponse {
    acceptedRules: boolean;
    // Question ID → answer IDs.
    answers: Record<string, string[]>;
    at: number;
}

export function onboardingResponseContent(response: OnboardingResponse): Record<string, unknown> {
    return { accepted_rules: response.acceptedRules, answers: response.answers, at: response.at };
}

// A member's answers, checked against the server's questions: unknown questions and answers are dropped, a
// single-answer question keeps one. null when it doesn't complete onboarding (rules not accepted, or a required
// question unanswered).
export function parseOnboardingResponse(content: unknown, config: OnboardingConfig): OnboardingResponse | null {
    if (!isObject(content) || (config.rules.length > 0 && content.accepted_rules !== true)) return null;
    const given = isObject(content.answers) ? content.answers : {};
    const answers: Record<string, string[]> = {};
    for (const question of config.questions) {
        const raw = given[question.id];
        const valid = new Set(question.answers.map((answer) => answer.id));
        const picked = [...new Set((Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === "string" && valid.has(id)))];
        const kept = question.multiple ? picked : picked.slice(0, 1);
        if (kept.length === 0) {
            if (question.required) return null;
            continue;
        }
        answers[question.id] = kept;
    }
    return { acceptedRules: content.accepted_rules === true, answers, at: typeof content.at === "number" ? content.at : 0 };
}

// The roles a finished onboarding gives: the member role, plus the roles of the answers picked.
export function rolesForResponse(config: OnboardingConfig, response: OnboardingResponse): string[] {
    const roles = new Set<string>();
    if (config.memberRoleId) roles.add(config.memberRoleId);
    for (const question of config.questions) {
        for (const answerId of response.answers[question.id] ?? []) {
            const roleId = question.answers.find((answer) => answer.id === answerId)?.roleId;
            if (roleId) roles.add(roleId);
        }
    }
    return [...roles];
}

export function welcomeText(config: OnboardingConfig, displayName: string): string {
    return config.welcome.message.replaceAll("{user}", displayName);
}

// --- Auto-mod ---

export interface AutomodConfig {
    enabled: boolean;
    // Messages containing any of these (whole words, any case) are removed.
    blockedWords: string[];
    // Links are removed from people below exemptRank.
    blockLinks: boolean;
    // More mentions than this in one message is spam (0 = no limit).
    maxMentions: number;
    // What happens besides removing the message.
    action: "delete" | "warn" | "timeout";
    timeoutMinutes: number;
    // Members with a role ranked at least this are never checked (moderators).
    exemptRank: number;
    // Without a bot: moderators' own Meadhall apps enforce the rules and give onboarding roles while they're online
    // (core/moderation/moderatorDuties.ts). Off unless the space turns it on.
    moderatorApps: boolean;
}

export const DEFAULT_AUTOMOD: AutomodConfig = {
    enabled: false,
    blockedWords: [],
    blockLinks: false,
    maxMentions: 0,
    action: "warn",
    timeoutMinutes: 10,
    exemptRank: 50,
    moderatorApps: false,
};

export function parseAutomod(content: unknown): AutomodConfig {
    if (!isObject(content)) return DEFAULT_AUTOMOD;
    const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
        typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
    return {
        enabled: content.enabled === true,
        blockedWords: [...new Set((Array.isArray(content.blocked_words) ? content.blocked_words : []).map((word) => cleanText(word, 64).toLowerCase()).filter(Boolean))].slice(0, MAX_WORDS),
        blockLinks: content.block_links === true,
        maxMentions: clamp(content.max_mentions, 0, 100, 0),
        action: content.action === "delete" || content.action === "timeout" ? content.action : "warn",
        timeoutMinutes: clamp(content.timeout_minutes, 1, 10_080, 10),
        exemptRank: clamp(content.exempt_rank, 1, 100, 50),
        moderatorApps: content.moderator_apps === true,
    };
}

export function automodContent(config: AutomodConfig): Record<string, unknown> {
    return {
        enabled: config.enabled,
        blocked_words: config.blockedWords,
        block_links: config.blockLinks,
        max_mentions: config.maxMentions,
        action: config.action,
        timeout_minutes: config.timeoutMinutes,
        exempt_rank: config.exemptRank,
        moderator_apps: config.moderatorApps,
    };
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|xyz|ru|co|me|link|app|dev)\b/i;

// Why a message breaks the rules (for the warning), or null. `mentions` = people it mentions.
export function automodViolation(body: string, mentions: number, config: AutomodConfig): string | null {
    if (!config.enabled) return null;
    const text = body.normalize("NFKC").toLowerCase();
    for (const word of config.blockedWords) {
        if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}($|[^\\p{L}\\p{N}])`, "u").test(text)) return "a blocked word";
    }
    if (config.blockLinks && LINK.test(text)) return "a link";
    if (config.maxMentions > 0 && mentions > config.maxMentions) return "too many mentions";
    return null;
}
