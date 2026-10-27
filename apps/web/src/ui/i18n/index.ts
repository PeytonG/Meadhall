// SPDX-License-Identifier: AGPL-3.0-only
// Translations. The English text is the key (t("Sign in")), so English needs no dictionary and anything not
// translated yet stays in English. {name} in a string is filled from the second argument.
// Language: Settings → Appearance → Language, or the sign-in screen; "system" follows the browser/OS.
import { useSyncExternalStore } from "react";

import de from "./locales/de";
import es from "./locales/es";
import fr from "./locales/fr";
import ptBR from "./locales/pt-BR";

export type Dictionary = Record<string, string>;

export const LANGUAGES: Array<{ code: string; name: string; dictionary: Dictionary | null }> = [
    { code: "en", name: "English", dictionary: null },
    { code: "es", name: "Español", dictionary: es },
    { code: "de", name: "Deutsch", dictionary: de },
    { code: "fr", name: "Français", dictionary: fr },
    { code: "pt-BR", name: "Português (Brasil)", dictionary: ptBR },
];

const STORAGE_KEY = "meadhall.language.v1";
let chosen = "system";
let active = "en";
const listeners = new Set<() => void>();

function matchLanguage(wanted: string): string {
    const lower = wanted.toLowerCase();
    const exact = LANGUAGES.find((language) => language.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0];
    return LANGUAGES.find((language) => language.code.toLowerCase().split("-")[0] === base)?.code ?? "en";
}

function systemLanguage(): string {
    if (typeof navigator === "undefined") return "en";
    for (const wanted of navigator.languages?.length ? navigator.languages : [navigator.language]) {
        const found = matchLanguage(wanted ?? "en");
        if (found !== "en" || wanted?.toLowerCase().startsWith("en")) return found;
    }
    return "en";
}

function apply(): void {
    active = chosen === "system" ? systemLanguage() : matchLanguage(chosen);
    if (typeof document !== "undefined") document.documentElement.lang = active;
    for (const listener of listeners) listener();
}

export function setLanguage(code: string): void {
    chosen = code === "system" ? "system" : matchLanguage(code);
    try {
        window.localStorage.setItem(STORAGE_KEY, chosen);
    } catch {
        // Kept for this session.
    }
    apply();
}

export function chosenLanguage(): string {
    return chosen;
}

export function activeLanguage(): string {
    return active;
}

// Before the first render: the choice saved on this device (the sign-in screen has no account settings yet).
try {
    chosen = (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) || "system";
} catch {
    chosen = "system";
}
apply();

export function t(text: string, values?: Record<string, string | number>): string {
    const dictionary = LANGUAGES.find((language) => language.code === active)?.dictionary;
    const translated = dictionary?.[text] ?? text;
    return values ? translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match)) : translated;
}

// Components that show translated text re-render when the language changes.
export function useLanguage(): string {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => active,
    );
}
