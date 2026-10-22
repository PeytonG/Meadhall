// Loaded lazily so the inlined LiveKit E2EE worker is only bundled into the voice join path.
export async function createLiveKitE2EEWorker(): Promise<Worker> {
    const { default: E2EEWorker } = await import("livekit-client/e2ee-worker?worker&inline");
    return new E2EEWorker();
}
