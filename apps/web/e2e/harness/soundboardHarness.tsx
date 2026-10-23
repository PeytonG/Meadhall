// SPDX-License-Identifier: AGPL-3.0-only
// The real in-call soundboard panel, laid out like the call view (call area above, controls bar below), with a
// full list of sounds, for layout tests in a real browser without a LiveKit server.
import React from "react";
import { createRoot } from "react-dom/client";

import { SoundboardPanel } from "../../src/ui/components/voice/SoundboardPanel";

const sounds = Array.from({ length: 20 }, (_, index) => ({
    id: `sound-${index}`,
    name: `Custom sound ${index + 1}`,
    emoji: "🔊",
    mxc: `mxc://example.org/sound${index}`,
}));
const client = {
    getAccountData: () => ({ getContent: () => ({ sounds }) }),
    on: () => undefined,
    off: () => undefined,
};

function Harness(): React.ReactElement {
    const [open, setOpen] = React.useState(true);
    const [volume, setVolume] = React.useState(80);
    return (
        // A DM call sits under the chat header, so its call view is much shorter than the window.
        <section className="voice-room-panel" style={{ height: (window as unknown as { callHeight?: string }).callHeight ?? "100vh", marginTop: (window as unknown as { callTop?: string }).callTop ?? 0 }}>
            <div className="voice-room-content" style={{ flex: 1, overflow: "hidden" }} data-testid="call-area" />
            <div className="voice-controls-bar">
                <div className="voice-soundboard-anchor">
                    <button type="button" data-soundboard-toggle onClick={() => setOpen((value) => !value)}>
                        Sounds
                    </button>
                    {open ? (
                        <SoundboardPanel
                            client={client as never}
                            onPlay={async () => undefined}
                            onClose={() => setOpen(false)}
                            volume={volume}
                            onVolumeChange={setVolume}
                        />
                    ) : null}
                </div>
            </div>
        </section>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
