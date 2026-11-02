// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    COMMAND_CONTENT_KEY,
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
} from "../../../src/core/bots/botProtocol";

const BOT = "@helper:example.org";

describe("bot protocol", () => {
    it("reads the bot list, ignoring anything that isn't a user ID", () => {
        expect(parseBots({ bots: { [BOT]: { added_by: "@admin:example.org", added_at: 5 }, "not-a-user": {}, "@x:y": "nope" } })).toEqual([
            { userId: BOT, addedBy: "@admin:example.org", addedAt: 5 },
        ]);
        expect(parseBots(null)).toEqual([]);
    });

    it("keeps only well-formed commands, with capped text and no control characters", () => {
        const commands = parseCommands(BOT, {
            commands: [
                { name: "Warn", description: "Warn someone‮ evil", options: [{ name: "user", type: "user", required: true }, { name: "reason", type: "text" }] },
                { name: "warn", description: "duplicate" },
                { name: "bad name!" },
                { name: "pick", options: [{ name: "colour", type: "choice", choices: ["red", "blue"] }, { name: "empty", type: "choice", choices: [] }] },
                { name: "x".repeat(40) },
            ],
        });
        expect(commands.map((command) => command.name)).toEqual(["warn", "pick"]);
        expect(commands[0]!.description).toBe("Warn someone evil");
        expect(commands[1]!.options).toEqual([
            { name: "colour", description: "", type: "choice", required: false, choices: ["red", "blue"] },
            { name: "empty", description: "", type: "text", required: false },
        ]);
        expect(parseCommands("not a user", { commands: [{ name: "x" }] })).toEqual([]);
    });

    it("parses typed commands: words in order, the last text option takes the rest", () => {
        const commands = parseCommands(BOT, {
            commands: [
                { name: "warn", options: [{ name: "user", type: "user", required: true }, { name: "reason", type: "text" }] },
                { name: "roll", options: [{ name: "sides", type: "number" }] },
                { name: "pick", options: [{ name: "colour", type: "choice", choices: ["red", "blue"], required: true }] },
            ],
        });
        expect(parseCommandInput("/warn @bob:example.org spamming links again", commands)).toEqual({
            bot: BOT,
            name: "warn",
            args: { user: "@bob:example.org", reason: "spamming links again" },
        });
        expect(parseCommandInput("/WARN @bob:example.org", commands)?.args).toEqual({ user: "@bob:example.org" });
        expect(parseCommandInput("/warn", commands)).toBeNull();
        expect(parseCommandInput("/warn bob", commands)).toBeNull();
        expect(parseCommandInput("/roll twenty", commands)).toBeNull();
        expect(parseCommandInput("/roll 20", commands)?.args).toEqual({ sides: "20" });
        expect(parseCommandInput("/pick green", commands)).toBeNull();
        expect(parseCommandInput("/unknown", commands)).toBeNull();
        expect(parseCommandInput("hello /warn @bob:example.org", commands)).toBeNull();
    });

    it("reads a command from a message strictly", () => {
        expect(parseCommandContent({ body: "/warn", [COMMAND_CONTENT_KEY]: { bot: BOT, name: "warn", args: { user: "@bob:example.org", bad: 5 } } })).toEqual({
            bot: BOT,
            name: "warn",
            args: { user: "@bob:example.org" },
        });
        expect(parseCommandContent({ [COMMAND_CONTENT_KEY]: { bot: "evil", name: "warn" } })).toBeNull();
        expect(parseCommandContent({ [COMMAND_CONTENT_KEY]: { bot: BOT, name: "../x" } })).toBeNull();
    });

    const onboarding = parseOnboarding({
        enabled: true,
        rules: ["Be kind", "No spam", 42],
        questions: [
            { id: "games", prompt: "What do you play?", multiple: true, answers: [{ id: "rpg", label: "RPGs", role_id: "role_rpg" }, { id: "fps", label: "Shooters", role_id: "role_fps" }] },
            { id: "region", prompt: "Where are you?", answers: [{ id: "eu", label: "Europe" }, { id: "na", label: "America" }] },
            { id: "optional", prompt: "Anything else?", required: false, answers: [{ id: "yes", label: "Yes", role_id: "role_extra" }] },
            { id: "bad id!", prompt: "x", answers: [{ id: "a", label: "a" }] },
        ],
        member_role_id: "role_member",
        gate: "enforced",
        welcome: { enabled: true, channel_id: "!general:example.org", message: "Hi {user}, welcome!" },
    });

    it("reads onboarding settings", () => {
        expect(onboarding.rules).toEqual(["Be kind", "No spam"]);
        expect(onboarding.questions.map((question) => question.id)).toEqual(["games", "region", "optional"]);
        expect(onboarding.gate).toBe("enforced");
        expect(welcomeText(onboarding, "Bob")).toBe("Hi Bob, welcome!");
    });

    it("accepts only complete answers to the server's own questions, and grants their roles", () => {
        const response = parseOnboardingResponse(
            { accepted_rules: true, answers: { games: ["rpg", "fps", "made-up"], region: ["eu", "na"], extra: ["x"] }, at: 9 },
            onboarding,
        );
        expect(response).toEqual({ acceptedRules: true, answers: { games: ["rpg", "fps"], region: ["eu"] }, at: 9 });
        expect(rolesForResponse(onboarding, response!).sort()).toEqual(["role_fps", "role_member", "role_rpg"]);
        // Rules not accepted, or a required question unanswered.
        expect(parseOnboardingResponse({ accepted_rules: false, answers: { games: ["rpg"], region: ["eu"] } }, onboarding)).toBeNull();
        expect(parseOnboardingResponse({ accepted_rules: true, answers: { games: ["rpg"] } }, onboarding)).toBeNull();
        expect(parseOnboardingResponse({ accepted_rules: true, answers: { games: ["nope"], region: ["eu"] } }, onboarding)).toBeNull();
    });

    it("flags blocked words (whole words, any case or width), links and mention spam", () => {
        const config = parseAutomod({ enabled: true, blocked_words: ["Grog", "scam coin"], block_links: true, max_mentions: 3 });
        expect(automodViolation("I love GROG!", 0, config)).toBe("a blocked word");
        expect(automodViolation("Ｇｒｏｇ", 0, config)).toBe("a blocked word");
        expect(automodViolation("buy scam coin now", 0, config)).toBe("a blocked word");
        expect(automodViolation("grogginess is fine", 0, config)).toBeNull();
        expect(automodViolation("see https://example.com", 0, config)).toBe("a link");
        expect(automodViolation("free nitro at steamgift.ru", 0, config)).toBe("a link");
        expect(automodViolation("hi all", 4, config)).toBe("too many mentions");
        expect(automodViolation("hi all", 3, config)).toBeNull();
        expect(automodViolation("Grog", 0, { ...config, enabled: false })).toBeNull();
    });
});
