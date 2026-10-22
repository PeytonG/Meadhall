// SPDX-License-Identifier: AGPL-3.0-only
// Lists font families installed on this device for Settings -> Appearance -> Font -> Other.
// Chromium (desktop app, Chrome, Edge) exposes the full list through queryLocalFonts(). Elsewhere (Android WebView,
// Firefox, Safari) we probe a list of common families with a canvas width check.

const COMMON_FONT_FAMILIES = [
    // Windows
    "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara", "Comic Sans MS", "Consolas", "Constantia",
    "Corbel", "Courier New", "Ebrima", "Franklin Gothic Medium", "Gabriola", "Georgia", "Impact", "Ink Free",
    "Lucida Console", "Lucida Sans Unicode", "Palatino Linotype", "Segoe Print", "Segoe Script", "Segoe UI",
    "Sitka Text", "Sylfaen", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Cascadia Code", "Cascadia Mono",
    // macOS / iOS
    "American Typewriter", "Avenir", "Avenir Next", "Baskerville", "Chalkboard", "Copperplate", "Didot", "Futura",
    "Geneva", "Gill Sans", "Helvetica", "Helvetica Neue", "Hoefler Text", "Lucida Grande", "Marker Felt", "Menlo",
    "Monaco", "Optima", "Papyrus", "SF Pro", "SF Mono", "Skia",
    // Linux
    "Cantarell", "DejaVu Sans", "DejaVu Sans Mono", "DejaVu Serif", "Droid Sans", "Fira Code", "Fira Sans",
    "Liberation Mono", "Liberation Sans", "Liberation Serif", "Noto Sans", "Noto Serif", "Noto Sans Mono", "Ubuntu",
    "Ubuntu Mono", "Hack", "Source Code Pro", "Source Sans Pro", "Red Hat Display", "Red Hat Text", "Red Hat Mono",
    // Android
    "Roboto", "Roboto Mono", "Roboto Slab", "Roboto Condensed", "Google Sans", "Product Sans", "Droid Serif",
    "Coming Soon", "Cutive Mono", "Dancing Script", "Carrois Gothic SC",
    // Widely installed web/office fonts
    "Inter", "Open Sans", "Lato", "Montserrat", "Poppins", "Raleway", "Nunito", "Merriweather", "Playfair Display",
    "JetBrains Mono", "IBM Plex Sans", "IBM Plex Mono", "Atkinson Hyperlegible", "OpenDyslexic",
];

type LocalFontData = { family: string };
type QueryLocalFonts = () => Promise<LocalFontData[]>;

// Strips anything that could break out of a CSS font-family string.
export function sanitizeFontFamily(value: string): string {
    return value.replace(/["'\\;{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function cssFontStack(family: string): string {
    const clean = sanitizeFontFamily(family);
    return clean ? `"${clean}", system-ui, sans-serif` : "system-ui, sans-serif";
}

function uniqueSorted(families: Iterable<string>): string[] {
    const seen = new Map<string, string>();
    for (const family of families) {
        const clean = sanitizeFontFamily(family);
        if (clean && !seen.has(clean.toLowerCase())) {
            seen.set(clean.toLowerCase(), clean);
        }
    }
    return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

// A family is installed when text set in it measures differently from every generic fallback.
function probeInstalledFamilies(candidates: string[]): string[] {
    if (typeof document === "undefined") {
        return [];
    }
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
        return [];
    }
    const sample = "mmmmmmmmmmlli1WQ@#&~ 0123456789";
    const generics = ["monospace", "serif", "sans-serif"];
    const baseline = generics.map((generic) => {
        context.font = `72px ${generic}`;
        return context.measureText(sample).width;
    });
    return candidates.filter((family) =>
        generics.some((generic, index) => {
            context.font = `72px "${family}", ${generic}`;
            return context.measureText(sample).width !== baseline[index];
        }),
    );
}

export interface SystemFontList {
    families: string[];
    // "local": the device's full list; "probe": common families we detected.
    source: "local" | "probe";
}

export async function listSystemFonts(): Promise<SystemFontList> {
    const query = (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
    if (typeof query === "function") {
        try {
            const fonts = await query();
            const families = uniqueSorted(fonts.map((font) => font.family));
            if (families.length > 0) {
                return { families, source: "local" };
            }
        } catch {
            // Permission denied or unsupported: fall back to probing.
        }
    }
    return { families: uniqueSorted(probeInstalledFamilies(COMMON_FONT_FAMILIES)), source: "probe" };
}
