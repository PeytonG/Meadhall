// SPDX-License-Identifier: AGPL-3.0-only
// Pick the part of a sound to put on the soundboard: a waveform with start and end handles (up to 8 seconds) and a
// preview of the selection.
import React, { useEffect, useMemo, useRef } from "react";

import { MAX_SOUND_SECONDS } from "../../voice/soundboard/soundboard";
import { clampSelection, waveformPeaks } from "../../voice/soundboard/trim";

interface SoundTrimmerProps {
    buffer: AudioBuffer;
    selection: { start: number; end: number };
    onChange: (selection: { start: number; end: number }) => void;
}

const BINS = 120;

export function SoundTrimmer({ buffer, selection, onChange }: SoundTrimmerProps): React.ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const peaks = useMemo(() => waveformPeaks(buffer.getChannelData(0), BINS), [buffer]);
    const duration = buffer.duration;

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const style = getComputedStyle(canvas);
        const { width, height } = canvas;
        context.clearRect(0, 0, width, height);
        const startX = (selection.start / duration) * width;
        const endX = (selection.end / duration) * width;
        context.fillStyle = style.getPropertyValue("--bg-active") || "#25262a";
        context.fillRect(startX, 0, endX - startX, height);
        const barWidth = width / BINS;
        peaks.forEach((peak, index) => {
            const x = index * barWidth;
            const inside = x + barWidth / 2 >= startX && x + barWidth / 2 <= endX;
            context.fillStyle = inside ? style.getPropertyValue("--primary") || "#a64dff" : style.getPropertyValue("--text-muted") || "#949ba4";
            const barHeight = Math.max(2, peak * height);
            context.fillRect(x, (height - barHeight) / 2, Math.max(1, barWidth - 1), barHeight);
        });
    }, [duration, peaks, selection]);

    const preview = (): void => {
        const context = new AudioContext();
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => void context.close();
        source.start(0, selection.start, selection.end - selection.start);
    };

    const length = selection.end - selection.start;
    return (
        <div className="sound-trimmer" data-testid="sound-trimmer">
            <canvas ref={canvasRef} width={300} height={56} className="sound-trimmer-wave" aria-hidden="true" />
            <label>
                <span>Start {selection.start.toFixed(2)} s</span>
                <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.05}
                    value={selection.start}
                    aria-label="Sound start"
                    onChange={(event) => onChange(clampSelection({ ...selection, start: Number(event.target.value) }, duration, "start"))}
                />
            </label>
            <label>
                <span>End {selection.end.toFixed(2)} s</span>
                <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.05}
                    value={selection.end}
                    aria-label="Sound end"
                    onChange={(event) => onChange(clampSelection({ ...selection, end: Number(event.target.value) }, duration, "end"))}
                />
            </label>
            <div className="sound-trimmer-footer">
                <span data-testid="sound-trimmer-length">
                    {length.toFixed(1)} s of {duration.toFixed(1)} s
                    {duration > MAX_SOUND_SECONDS ? ` (up to ${MAX_SOUND_SECONDS} s)` : ""}
                </span>
                <button type="button" className="settings-button settings-button-secondary" onClick={preview}>
                    Preview
                </button>
            </div>
        </div>
    );
}
