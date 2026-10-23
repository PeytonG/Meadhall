// SPDX-License-Identifier: AGPL-3.0-only
// Screen sharing in a real browser without a call server: the source picker with previews, and the call view's
// stage with two streams side by side (canvas streams), using the app's real stylesheet.
import React from "react";
import { createRoot } from "react-dom/client";

import { ScreenSharePicker } from "../../src/ui/components/voice/ScreenSharePicker";

// A fake desktop: a colored "screen" with a title bar, drawn on a canvas.
function paint(canvas: HTMLCanvasElement, hue: number, label: string, frame = 0): void {
    const context = canvas.getContext("2d")!;
    context.fillStyle = `hsl(${hue} 45% 18%)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `hsl(${hue} 60% 45%)`;
    context.fillRect(0, 0, canvas.width, canvas.height * 0.08);
    context.fillStyle = "#ffffff";
    context.font = `${Math.round(canvas.height / 9)}px sans-serif`;
    context.fillText(label, canvas.width * 0.06, canvas.height * 0.5);
    context.fillStyle = `hsl(${(hue + 40) % 360} 70% 60%)`;
    context.fillRect(((frame * 7) % canvas.width) * 0.8, canvas.height * 0.7, canvas.width * 0.18, canvas.height * 0.12);
}

function thumbnail(hue: number, label: string): string {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    paint(canvas, hue, label);
    return canvas.toDataURL();
}

const sources = [
    { id: "screen:0:0", name: "Entire screen 1", kind: "screen" as const, thumbnail: thumbnail(210, "Screen 1"), icon: null },
    { id: "screen:1:0", name: "Entire screen 2", kind: "screen" as const, thumbnail: thumbnail(280, "Screen 2"), icon: null },
    { id: "window:1:0", name: "BeamNG.drive", kind: "window" as const, thumbnail: thumbnail(20, "BeamNG.drive"), icon: null },
    { id: "window:2:0", name: "Visual Studio Code - Meadhall", kind: "window" as const, thumbnail: thumbnail(200, "Code"), icon: null },
    { id: "window:3:0", name: "Meadhall", kind: "window" as const, thumbnail: thumbnail(275, "Meadhall"), icon: null },
    { id: "window:4:0", name: "A window that can't be previewed", kind: "window" as const, thumbnail: null, icon: null },
];

function StreamTile({ hue, label }: { hue: number; label: string }): React.ReactElement {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    React.useEffect(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        let frame = 0;
        const timer = window.setInterval(() => paint(canvas, hue, label, (frame += 1)), 100);
        paint(canvas, hue, label);
        if (videoRef.current) videoRef.current.srcObject = canvas.captureStream(10);
        return () => window.clearInterval(timer);
    }, [hue, label]);
    return (
        <button type="button" className="voice-room-stage-tile" data-testid="screen-share-tile">
            <video ref={videoRef} className="voice-room-stage-video" autoPlay playsInline muted />
            <span className="voice-room-stage-tile-name">{label}</span>
        </button>
    );
}

function Harness(): React.ReactElement {
    const [selected, setSelected] = React.useState<string | null>("window:1:0");
    const mode = (window as unknown as { harnessMode?: string }).harnessMode ?? "stage";
    if (mode === "picker") {
        return (
            <div className="room-dialog-overlay" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}>
                <div className="room-dialog" role="dialog" aria-label="Choose stream source">
                    <div className="room-dialog-header">
                        <h2>Choose stream source</h2>
                    </div>
                    <div className="room-dialog-body">
                        <ScreenSharePicker sources={sources} selectedId={selected} onSelect={setSelected} onConfirm={() => undefined} />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <section className="voice-room-panel" style={{ height: "100vh" }}>
            <div className="voice-room-content">
                <div className="voice-room-stage" data-testid="stage">
                    <div className="voice-room-stage-header">
                        <h3>Screen share</h3>
                        <div className="voice-room-stage-header-actions">
                            <span className="voice-room-stage-status">2 streams live</span>
                            <button type="button" className="voice-room-stage-audio-button">Mute audio</button>
                            <button type="button" className="voice-room-stage-fullscreen-button">Fullscreen</button>
                        </div>
                    </div>
                    <div className="voice-room-stage-video-wrap" data-testid="stage-video">
                        <div className="voice-room-stage-grid">
                            <StreamTile hue={20} label="Wiglaf: BeamNG.drive" />
                            <StreamTile hue={210} label="Beowulf: Entire screen" />
                        </div>
                    </div>
                    <div className="voice-room-stage-picker">
                        <button type="button" className="voice-room-stage-picker-button is-active">Show all</button>
                        <button type="button" className="voice-room-stage-picker-button">Wiglaf</button>
                        <button type="button" className="voice-room-stage-picker-button">Beowulf</button>
                    </div>
                </div>
                <div className="voice-room-participants-list" data-testid="participants" style={{ minHeight: 120 }} />
            </div>
            <div className="voice-controls-bar">
                <button type="button" className="voice-ctrl-btn">Mute</button>
                <button type="button" className="voice-ctrl-btn is-active">Share</button>
                <button type="button" className="voice-ctrl-btn">Sounds</button>
                <button type="button" className="voice-ctrl-btn">Leave</button>
            </div>
        </section>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
