// SPDX-License-Identifier: AGPL-3.0-only
// The X in close buttons, drawn rather than typed: a typed "x" or "×" sits on the font's baseline and is never quite
// centered in its button.
import React from "react";

export function CloseIcon({ size = 16 }: { size?: number }): React.ReactElement {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
    );
}
