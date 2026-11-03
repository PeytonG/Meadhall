// SPDX-License-Identifier: AGPL-3.0-only
// The small arrow next to the mic and headphones in the user panel, like Discord's: pick the input or output device
// right there (it switches live in a call), or open the voice settings.
import React, { useEffect, useRef, useState } from "react";

interface DevicePickerProps {
    kind: "audioinput" | "audiooutput";
    selectedId: string;
    onSelect: (deviceId: string) => void;
    onOpenSettings: () => void;
}

export function DevicePicker({ kind, selectedId, onSelect, onOpenSettings }: DevicePickerProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const label = kind === "audioinput" ? "Input device" : "Output device";

    useEffect(() => {
        if (!open) return undefined;
        void navigator.mediaDevices
            ?.enumerateDevices()
            .then((all) => setDevices(all.filter((device) => device.kind === kind)))
            .catch(() => setDevices([]));
        const onDown = (event: MouseEvent): void => {
            if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [kind, open]);

    const named = devices.filter((device) => device.deviceId !== "default" && device.deviceId !== "communications");
    return (
        <div className="device-picker" ref={wrapRef}>
            <button
                type="button"
                className="device-picker-toggle"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={kind === "audioinput" ? "Microphone options" : "Speaker options"}
                title={kind === "audioinput" ? "Microphone options" : "Speaker options"}
                onClick={() => setOpen((value) => !value)}
                data-testid={kind === "audioinput" ? "mic-options" : "speaker-options"}
            >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open ? (
                <div className="device-picker-menu" role="menu" aria-label={label}>
                    <span className="device-picker-title">{label}</span>
                    <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedId === "default" || !selectedId}
                        className="device-picker-item"
                        onClick={() => {
                            onSelect("default");
                            setOpen(false);
                        }}
                    >
                        Default
                    </button>
                    {named.map((device, index) => (
                        <button
                            key={device.deviceId || index}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selectedId === device.deviceId}
                            className="device-picker-item"
                            onClick={() => {
                                onSelect(device.deviceId);
                                setOpen(false);
                            }}
                        >
                            {device.label || `${kind === "audioinput" ? "Microphone" : "Speaker"} ${index + 1}`}
                        </button>
                    ))}
                    <hr className="device-picker-divider" />
                    <button
                        type="button"
                        role="menuitem"
                        className="device-picker-item"
                        onClick={() => {
                            setOpen(false);
                            onOpenSettings();
                        }}
                    >
                        Voice Settings
                    </button>
                </div>
            ) : null}
        </div>
    );
}
