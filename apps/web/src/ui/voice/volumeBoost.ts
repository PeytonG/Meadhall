// SPDX-License-Identifier: AGPL-3.0-only
// Per-person call volume above 100%. <audio>.volume stops at 1.0, so a person turned up past 100% plays through a
// Web Audio gain node instead. Everyone at or below 100% keeps the plain element path.
//
// Chromium never feeds remote WebRTC audio into createMediaElementSource (it outputs silence; checked in a
// loopback test), so the gain reads the element's MediaStream directly. The element keeps playing at volume 0,
// which Chromium needs for remote audio to flow, and its `muted` flag (deafen) still silences the boosted path.

interface BoostRoute {
    gain: GainNode;
    percent: number;
    source: MediaStreamAudioSourceNode;
    onVolumeChange: () => void;
}

let sharedContext: AudioContext | null = null;
let sharedSinkId = "";
const routes = new Map<HTMLMediaElement, BoostRoute>();

type SinkAwareContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

function getContext(): AudioContext | null {
    if (sharedContext) {
        return sharedContext;
    }
    const ContextClass = typeof window === "undefined" ? undefined : window.AudioContext;
    if (!ContextClass) {
        return null;
    }
    sharedContext = new ContextClass();
    if (sharedSinkId) {
        void (sharedContext as SinkAwareContext).setSinkId?.(sharedSinkId).catch(() => undefined);
    }
    return sharedContext;
}

// The gain applied in Web Audio for a slider percentage; 1 means the plain element path is enough.
export function boostGainFor(percent: number): number {
    return Math.max(1, percent / 100);
}

function applyRoute(element: HTMLMediaElement, route: BoostRoute): void {
    route.gain.gain.value = element.muted ? 0 : boostGainFor(route.percent);
}

function startRoute(element: HTMLMediaElement, percent: number): BoostRoute | null {
    const stream = element.srcObject;
    const context = getContext();
    if (!context || !(stream instanceof MediaStream) || stream.getAudioTracks().length === 0) {
        return null;
    }
    try {
        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain();
        source.connect(gain).connect(context.destination);
        const route: BoostRoute = { gain, percent, source, onVolumeChange: () => applyRoute(element, route) };
        // Fires when the app (un)mutes the element, e.g. deafen.
        element.addEventListener("volumechange", route.onVolumeChange);
        routes.set(element, route);
        if (context.state === "suspended") {
            void context.resume().catch(() => undefined);
        }
        return route;
    } catch {
        return null;
    }
}

function stopRoute(element: HTMLMediaElement, route: BoostRoute): void {
    element.removeEventListener("volumechange", route.onVolumeChange);
    route.source.disconnect();
    route.gain.disconnect();
    routes.delete(element);
}

export function setElementVolumePercent(element: HTMLMediaElement, percent: number): void {
    const existing = routes.get(element);
    if (boostGainFor(percent) > 1) {
        const route = existing ?? startRoute(element, percent);
        if (route) {
            route.percent = percent;
            element.volume = 0;
            applyRoute(element, route);
            return;
        }
        // No Web Audio or no stream: play at the element's maximum.
        element.volume = 1;
        return;
    }
    if (existing) {
        stopRoute(element, existing);
    }
    element.volume = Math.max(0, percent / 100);
}

// Call when an element is detached so its Web Audio nodes are released.
export function releaseElementVolume(element: HTMLMediaElement): void {
    const route = routes.get(element);
    if (route) {
        stopRoute(element, route);
    }
}

// Boosted voices play through the AudioContext, so it must follow the chosen speaker like the elements do.
export function setVolumeBoostSinkId(sinkId: string): void {
    sharedSinkId = sinkId === "default" ? "" : sinkId;
    void (sharedContext as SinkAwareContext | null)?.setSinkId?.(sharedSinkId).catch(() => undefined);
}
