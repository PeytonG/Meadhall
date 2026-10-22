// SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_ACCENT_COLOR, hexToHsv, hsvToHex, normalizeHexColor } from "./accentColor";

// A chunky pixel-art color wheel: hue around the circle, saturation outwards, brightness in stepped blocks.
const GRID = 19;
const CELL = 12;
const CENTER = (GRID - 1) / 2;
const RADIUS = GRID / 2;
const BRIGHTNESS_STEPS = [1, 0.85, 0.7, 0.55, 0.4];

export const ACCENT_PRESETS: Array<{ name: string; color: string }> = [
    { name: "Bright purple", color: DEFAULT_ACCENT_COLOR },
    { name: "Crimson", color: "#ff4d6d" },
    { name: "Ember", color: "#ff8a3d" },
    { name: "Gold", color: "#ffc531" },
    { name: "Emerald", color: "#2ecc71" },
    { name: "Teal", color: "#1fb5c9" },
    { name: "Sky", color: "#4d7cff" },
    { name: "Rose", color: "#ff6ad5" },
];

interface Cell {
    x: number;
    y: number;
}

function cellColor({ x, y }: Cell, value: number): string | null {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distance = Math.hypot(dx, dy);
    if (distance > RADIUS - 0.25) return null;
    const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    return hsvToHex(hue, Math.min(1, distance / (RADIUS - 0.5)), value);
}

function cellForColor(hex: string): Cell {
    const { hue, saturation } = hexToHsv(hex);
    const distance = saturation * (RADIUS - 0.5);
    const angle = (hue * Math.PI) / 180;
    return { x: Math.round(CENTER + Math.cos(angle) * distance), y: Math.round(CENTER + Math.sin(angle) * distance) };
}

function closestBrightness(hex: string): number {
    const { value } = hexToHsv(hex);
    return BRIGHTNESS_STEPS.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best));
}

interface PixelColorWheelProps {
    value: string;
    onChange: (color: string) => void;
}

export function PixelColorWheel({ value, onChange }: PixelColorWheelProps): React.ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hexDraft, setHexDraft] = useState(value);
    const brightness = useMemo(() => closestBrightness(value), [value]);
    const selected = useMemo(() => cellForColor(value), [value]);

    useEffect(() => setHexDraft(value), [value]);

    useEffect(() => {
        const context = canvasRef.current?.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, GRID * CELL, GRID * CELL);
        for (let y = 0; y < GRID; y += 1) {
            for (let x = 0; x < GRID; x += 1) {
                const color = cellColor({ x, y }, brightness);
                if (!color) continue;
                context.fillStyle = color;
                context.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
        }
        // Two-tone pixel frame around the selected cell, visible on any color.
        context.fillStyle = "#000000";
        context.fillRect(selected.x * CELL - 3, selected.y * CELL - 3, CELL + 6, CELL + 6);
        context.fillStyle = "#ffffff";
        context.fillRect(selected.x * CELL - 1, selected.y * CELL - 1, CELL + 2, CELL + 2);
        context.fillStyle = cellColor(selected, brightness) ?? value;
        context.fillRect(selected.x * CELL + 1, selected.y * CELL + 1, CELL - 2, CELL - 2);
    }, [brightness, selected, value]);

    const pick = (cell: Cell): void => {
        const color = cellColor(cell, brightness);
        if (color) onChange(color);
    };

    const pickFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        const bounds = event.currentTarget.getBoundingClientRect();
        pick({
            x: Math.floor(((event.clientX - bounds.left) / bounds.width) * GRID),
            y: Math.floor(((event.clientY - bounds.top) / bounds.height) * GRID),
        });
    };

    const moves: Record<string, Cell> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
    };

    return (
        <div className="pixel-color-picker">
            <div className="pixel-color-wheel-row">
                <canvas
                    ref={canvasRef}
                    className="pixel-color-wheel"
                    width={GRID * CELL}
                    height={GRID * CELL}
                    tabIndex={0}
                    role="application"
                    aria-label={`Theme color wheel, current color ${value}. Use the arrow keys to pick a color.`}
                    onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        pickFromPointer(event);
                    }}
                    onPointerMove={(event) => {
                        if (event.buttons === 1) pickFromPointer(event);
                    }}
                    onKeyDown={(event) => {
                        const move = moves[event.key];
                        if (!move) return;
                        event.preventDefault();
                        pick({ x: selected.x + move.x, y: selected.y + move.y });
                    }}
                />
                <div className="pixel-color-brightness" role="group" aria-label="Brightness">
                    {BRIGHTNESS_STEPS.map((step) => (
                        <button
                            key={step}
                            type="button"
                            className={`pixel-color-brightness-step${step === brightness ? " is-active" : ""}`}
                            style={{ background: cellColor(selected, step) ?? value }}
                            aria-label={`Brightness ${Math.round(step * 100)}%`}
                            aria-pressed={step === brightness}
                            onClick={() => onChange(cellColor(selected, step) ?? value)}
                        />
                    ))}
                </div>
            </div>

            <div className="pixel-color-presets" role="group" aria-label="Preset colors">
                {ACCENT_PRESETS.map((preset) => (
                    <button
                        key={preset.color}
                        type="button"
                        className={`pixel-color-swatch${preset.color === value ? " is-active" : ""}`}
                        style={{ background: preset.color }}
                        title={preset.name}
                        aria-label={preset.name}
                        aria-pressed={preset.color === value}
                        onClick={() => onChange(preset.color)}
                    />
                ))}
            </div>

            <div className="pixel-color-controls">
                <span className="pixel-color-preview" style={{ background: value }} aria-hidden="true" />
                <label>
                    Hex
                    <input
                        type="text"
                        value={hexDraft}
                        maxLength={7}
                        spellCheck={false}
                        onChange={(event) => {
                            setHexDraft(event.target.value);
                            const color = normalizeHexColor(event.target.value);
                            if (color && event.target.value.replace("#", "").length === 6) onChange(color);
                        }}
                        onBlur={() => setHexDraft(value)}
                    />
                </label>
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    disabled={value === DEFAULT_ACCENT_COLOR}
                    onClick={() => onChange(DEFAULT_ACCENT_COLOR)}
                >
                    Reset to bright purple
                </button>
            </div>
        </div>
    );
}
