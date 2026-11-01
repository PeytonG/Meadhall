// SPDX-License-Identifier: AGPL-3.0-only
// See yourself before anyone else does: a local-only preview of a camera (nothing is sent), used before turning the
// camera on in a call and in Settings → Audio & Video. The camera is released as soon as the preview closes.
import React, { useEffect, useRef, useState } from "react";

import { RoomDialog } from "../rooms/RoomDialog";

interface CameraPreviewProps {
    // "default" or "" means the system's default camera.
    deviceId: string;
}

function cameraErrorText(error: unknown): string {
    const name = (error as { name?: string } | null)?.name;
    if (name === "NotAllowedError") return "Meadhall isn't allowed to use your camera. Allow it in your system's privacy settings.";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found.";
    if (name === "NotReadableError") return "The camera is in use by another app.";
    return "Couldn't start the camera.";
}

export function CameraPreview({ deviceId }: CameraPreviewProps): React.ReactElement {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [state, setState] = useState<{ status: "starting" | "live" | "error"; message?: string }>({ status: "starting" });

    useEffect(() => {
        let stream: MediaStream | null = null;
        let cancelled = false;
        setState({ status: "starting" });
        const video = deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : true;
        navigator.mediaDevices
            ?.getUserMedia({ video, audio: false })
            .then((opened) => {
                if (cancelled) {
                    opened.getTracks().forEach((track) => track.stop());
                    return;
                }
                stream = opened;
                if (videoRef.current) videoRef.current.srcObject = opened;
                setState({ status: "live" });
            })
            .catch((error: unknown) => {
                if (!cancelled) setState({ status: "error", message: cameraErrorText(error) });
            });
        if (!navigator.mediaDevices) setState({ status: "error", message: "Cameras aren't available here." });
        return () => {
            cancelled = true;
            stream?.getTracks().forEach((track) => track.stop());
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [deviceId]);

    return (
        <div className="camera-preview" data-testid="camera-preview" data-state={state.status}>
            <video ref={videoRef} className="camera-preview-video" autoPlay playsInline muted aria-label="Your camera preview" />
            {state.status === "starting" ? <p className="camera-preview-note">Starting camera…</p> : null}
            {state.status === "error" ? (
                <p className="camera-preview-note is-error" role="alert">
                    {state.message}
                </p>
            ) : null}
        </div>
    );
}

interface CameraPreviewDialogProps {
    open: boolean;
    deviceId: string;
    cameras: MediaDeviceInfo[];
    onDeviceChange: (deviceId: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}

// Before the camera goes on in a call: check how you look and pick the camera, then turn it on.
export function CameraPreviewDialog({ open, deviceId, cameras, onDeviceChange, onConfirm, onClose }: CameraPreviewDialogProps): React.ReactElement | null {
    return (
        <RoomDialog
            open={open}
            title="Camera preview"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="settings-button settings-button-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="settings-button" onClick={onConfirm} data-testid="camera-preview-confirm">
                        Turn on camera
                    </button>
                </>
            }
        >
            {open ? <CameraPreview deviceId={deviceId} /> : null}
            <label className="settings-field">
                <span>Camera</span>
                <select value={deviceId || "default"} onChange={(event) => onDeviceChange(event.target.value)} aria-label="Camera">
                    <option value="default">System default</option>
                    {cameras.map((camera, index) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                            {camera.label || `Camera ${index + 1}`}
                        </option>
                    ))}
                </select>
            </label>
            <p className="settings-inline-note">Only you see this preview. Others see you after you turn the camera on.</p>
        </RoomDialog>
    );
}
