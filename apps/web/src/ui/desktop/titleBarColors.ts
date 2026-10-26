// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app draws the window controls (minimize/maximize/close) in a strip over the top-right corner. Their
// background must match whatever the app shows there (header, member list, settings), in any theme or accent.

function toHex(color: string): string | null {
    const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(color);
    if (!match) {
        return null;
    }
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    if (alpha < 0.9) {
        return null; // see-through: keep looking further down the stack
    }
    return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

// The first solid background under the window controls, from the top of the stack down.
export function readTitleBarColors(): { color: string; symbolColor: string } | null {
    if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
        return null;
    }
    const x = Math.max(0, window.innerWidth - 70);
    const y = 12;
    let color: string | null = null;
    for (const element of document.elementsFromPoint(x, y)) {
        // Gradients (e.g. a profile card style) have no background color: they say what color is at the top right.
        const declared = element instanceof HTMLElement ? element.dataset.titlebarColor : undefined;
        if (declared && /^#[0-9a-f]{6}$/i.test(declared)) {
            color = declared.toLowerCase();
            break;
        }
        color = toHex(getComputedStyle(element).backgroundColor);
        if (color) {
            break;
        }
    }
    const rootStyle = getComputedStyle(document.documentElement);
    color ??= toHex(getComputedStyle(document.body).backgroundColor);
    const symbolColor = toHex(rootStyle.color) ?? toHex(getComputedStyle(document.body).color) ?? "#e6edf3";
    return color ? { color, symbolColor } : null;
}

let lastSent = "";

export function syncDesktopTitleBarColors(): void {
    const bridge = window.heorotDesktop;
    if (!bridge?.setTitleBarColors) {
        return;
    }
    const colors = readTitleBarColors();
    if (!colors) {
        return;
    }
    const key = `${colors.color}${colors.symbolColor}`;
    if (key === lastSent) {
        return;
    }
    lastSent = key;
    void bridge.setTitleBarColors(colors).catch(() => {
        lastSent = "";
    });
}
