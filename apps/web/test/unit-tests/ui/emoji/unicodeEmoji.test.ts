// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { splitUnicodeEmoji } from "../../../../src/ui/emoji/unicodeEmoji";

const emojiOf = (text: string): string[] => splitUnicodeEmoji(text).filter((piece) => piece.type === "emoji").map((piece) => piece.value);

describe("finding emoji in text", () => {
    it("separates emoji from words, keeping the text intact", () => {
        const pieces = splitUnicodeEmoji("Cheers 🍺 and 🔥!");
        expect(pieces.map((piece) => piece.value).join("")).toBe("Cheers 🍺 and 🔥!");
        expect(emojiOf("Cheers 🍺 and 🔥!")).toEqual(["🍺", "🔥"]);
    });

    it("keeps multi-part emoji whole: skin tones, joined families, flags, keycaps, variation selectors", () => {
        expect(emojiOf("👍🏽")).toEqual(["👍🏽"]);
        expect(emojiOf("👨‍👩‍👧")).toEqual(["👨‍👩‍👧"]);
        expect(emojiOf("🇺🇸🇩🇪")).toEqual(["🇺🇸", "🇩🇪"]);
        expect(emojiOf("1️⃣")).toEqual(["1️⃣"]);
        expect(emojiOf("❤️")).toEqual(["❤️"]);
    });

    it("leaves plain text and numbers alone", () => {
        expect(emojiOf("Room 42, level 3 #general")).toEqual([]);
    });
});
