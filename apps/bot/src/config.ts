// SPDX-License-Identifier: AGPL-3.0-only
// The bot's settings, from the environment (never from the servers it's in: those only choose what it does there,
// through Server Settings in Meadhall).

export interface BotConfig {
    homeserverUrl: string;
    // The bot's account (an ordinary Matrix account made for it).
    user: string;
    password: string;
    deviceName: string;
    // Who may invite the bot into a server: homeserver names ("example.org"), user IDs, or "*" for anyone.
    allowedInviters: string[];
}

function required(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name} (see apps/bot/README.md).`);
    return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
    const homeserverUrl = required(env, "MEADHALL_BOT_HOMESERVER").replace(/\/+$/, "");
    if (!/^https?:\/\//.test(homeserverUrl)) throw new Error("MEADHALL_BOT_HOMESERVER must start with https:// (or http:// for a local server).");
    return {
        homeserverUrl,
        user: required(env, "MEADHALL_BOT_USER"),
        password: required(env, "MEADHALL_BOT_PASSWORD"),
        deviceName: env.MEADHALL_BOT_DEVICE_NAME?.trim() || "Meadhall bot",
        // By default, people on the bot's own homeserver (its server name comes from the sign-in, see bot.ts).
        allowedInviters: (env.MEADHALL_BOT_ALLOWED_INVITERS ?? "").split(",").map((entry) => entry.trim()).filter(Boolean),
    };
}
