// SPDX-License-Identifier: AGPL-3.0-only
// Marks standard (Unicode) emoji in text so they can be drawn as pixel art (Settings -> Appearance -> Pixel emoji).
// The emoji stays real text inside a <span class="unicode-emoji">, so copying, searching and screen readers work;
// the pixel look is an SVG filter applied by CSS (see PixelEmojiFilter and pixel.css).
import React from "react";

// One emoji: a pictograph with its variation selectors, skin tones and zero-width-joined parts, a keycap, or a
// pair of regional indicators (a flag).
const EMOJI_PATTERN =
    /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*)/gu;

export interface TextPiece {
    type: "text" | "emoji";
    value: string;
}

export function splitUnicodeEmoji(text: string): TextPiece[] {
    const pieces: TextPiece[] = [];
    let last = 0;
    for (const match of text.matchAll(EMOJI_PATTERN)) {
        const start = match.index ?? 0;
        if (start > last) {
            pieces.push({ type: "text", value: text.slice(last, start) });
        }
        pieces.push({ type: "emoji", value: match[0] });
        last = start + match[0].length;
    }
    if (last < text.length) {
        pieces.push({ type: "text", value: text.slice(last) });
    }
    return pieces;
}

export function renderTextWithEmoji(text: string, keyPrefix: string): React.ReactNode[] {
    return splitUnicodeEmoji(text).map((piece, index) =>
        piece.type === "emoji" ? (
            <span key={`${keyPrefix}_e${index}`} className="unicode-emoji">
                {piece.value}
            </span>
        ) : (
            <React.Fragment key={`${keyPrefix}_t${index}`}>{piece.value}</React.Fragment>
        ),
    );
}

// The SVG filters the pixel emoji use, rendered once near the app root. Each samples the glyph on a grid and grows
// every sample into a square block, so the emoji turns into chunky pixels. Two block sizes: text and big emoji.
export function PixelEmojiFilter(): React.ReactElement {
    const filter = (id: string, block: number): React.ReactElement => (
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feFlood x={block / 2} y={block / 2} height="1" width="1" />
            <feComposite width={block} height={block} />
            <feTile result="grid" />
            <feComposite in="SourceGraphic" in2="grid" operator="in" />
            <feMorphology operator="dilate" radius={block / 2} />
        </filter>
    );
    return (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
            {filter("meadhall-pixel-emoji", 2)}
            {filter("meadhall-pixel-emoji-big", 4)}
        </svg>
    );
}
