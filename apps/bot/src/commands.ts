// SPDX-License-Identifier: AGPL-3.0-only
// The bot's slash commands. Registered in each server it works for (Meadhall shows them when you type /), and
// also understood typed as !command from other apps. Moderation commands check that the person asking may do it
// themselves (the room's kick/ban level) and that their target ranks below both them and the bot.

export const BOT_COMMANDS = [
    { name: "help", description: "What the bot can do", options: [] },
    { name: "rules", description: "Show the server's rules", options: [] },
    {
        name: "warn",
        description: "Warn someone (moderators)",
        options: [
            { name: "user", description: "Who to warn", type: "user", required: true },
            { name: "reason", description: "Why", type: "text", required: false },
        ],
    },
    {
        name: "timeout",
        description: "Stop someone talking for a while (moderators)",
        options: [
            { name: "user", description: "Who", type: "user", required: true },
            { name: "minutes", description: "How long (default 10)", type: "number", required: false },
            { name: "reason", description: "Why", type: "text", required: false },
        ],
    },
    {
        name: "untimeout",
        description: "End someone's timeout (moderators)",
        options: [{ name: "user", description: "Who", type: "user", required: true }],
    },
    {
        name: "kick",
        description: "Remove someone from the server (moderators)",
        options: [
            { name: "user", description: "Who", type: "user", required: true },
            { name: "reason", description: "Why", type: "text", required: false },
        ],
    },
    {
        name: "ban",
        description: "Ban someone from the server (moderators)",
        options: [
            { name: "user", description: "Who", type: "user", required: true },
            { name: "reason", description: "Why", type: "text", required: false },
        ],
    },
] as const;

export const HELP_TEXT = [
    "I'm this server's bot. Commands (type / in Meadhall, or ! in other apps):",
    "/rules: the server's rules",
    "/warn <user> [reason], /timeout <user> [minutes] [reason], /untimeout <user>, /kick <user> [reason], /ban <user> [reason]: for moderators",
].join("\n");

// A timeout's length: 1 minute to a week.
export function timeoutMinutes(value: string | undefined, fallback = 10): number {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? Math.min(10_080, Math.max(1, Math.round(minutes))) : fallback;
}
