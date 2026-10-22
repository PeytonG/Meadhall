// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";

// True while the CSS media query matches (e.g. the phone/tablet layouts in App.css).
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() =>
        typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
    );

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return undefined;
        }
        const list = window.matchMedia(query);
        const onChange = (): void => setMatches(list.matches);
        onChange();
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
    }, [query]);

    return matches;
}
