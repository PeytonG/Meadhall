// SPDX-License-Identifier: AGPL-3.0-only
// The user panel's status menu, like Discord's: Online / Away / Do Not Disturb / Invisible and a custom status.
import React, { useEffect, useRef, useState } from "react";

import type { ChosenStatus, OwnStatus } from "../presence/clientStatus";
import type { StoredAccount } from "../../core/storage/accounts";

const CHOICES: ReadonlyArray<{ state: ChosenStatus; label: string; hint: string }> = [
    { state: "auto", label: "Automatic", hint: "Online, or Away after 10 minutes without input" },
    { state: "online", label: "Online", hint: "Always show as online" },
    { state: "idle", label: "Away", hint: "Always show as away" },
    { state: "dnd", label: "Do Not Disturb", hint: "Mutes your notifications and call ringing" },
    { state: "invisible", label: "Invisible", hint: "Appear offline, still use Meadhall" },
];

interface StatusMenuProps {
    status: OwnStatus;
    onChange: (status: OwnStatus) => void;
    onOpenSettings: () => void;
    onClose: () => void;
    // Other accounts signed in on this device, and switching/adding (see ui/accounts).
    accounts?: StoredAccount[];
    onSwitchAccount?: (userId: string) => void;
    onAddAccount?: () => void;
}

export function StatusMenu({ status, onChange, onOpenSettings, onClose, accounts = [], onSwitchAccount, onAddAccount }: StatusMenuProps): React.ReactElement {
    const [text, setText] = useState(status.text);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent): void => {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        };
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose]);

    const saveText = (): void => {
        if (text.trim() !== status.text) onChange({ ...status, text: text.trim().slice(0, 128) });
    };

    return (
        <div className="status-menu" role="menu" aria-label="Set status" ref={menuRef}>
            <label className="status-menu-text">
                <span>Custom status</span>
                <input
                    type="text"
                    value={text}
                    maxLength={128}
                    placeholder="What are you up to?"
                    onChange={(event) => setText(event.target.value)}
                    onBlur={saveText}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            saveText();
                            onClose();
                        }
                    }}
                    data-testid="status-text"
                />
            </label>
            {status.text ? (
                <button type="button" role="menuitem" className="status-menu-item" onClick={() => { setText(""); onChange({ ...status, text: "" }); }}>
                    Clear custom status
                </button>
            ) : null}
            <div className="status-menu-divider" />
            {CHOICES.map((choice) => (
                <button
                    key={choice.state}
                    type="button"
                    role="menuitemradio"
                    aria-checked={status.state === choice.state}
                    className={`status-menu-item${status.state === choice.state ? " is-active" : ""}`}
                    onClick={() => {
                        onChange({ state: choice.state, text: text.trim().slice(0, 128) });
                        onClose();
                    }}
                >
                    <span className={`status-menu-dot is-${choice.state}`} aria-hidden="true" />
                    <span className="status-menu-label">
                        {choice.label}
                        <small>{choice.hint}</small>
                    </span>
                </button>
            ))}
            <div className="status-menu-divider" />
            {accounts.length > 0 ? <div className="status-menu-heading">Switch account</div> : null}
            {accounts.map((account) => (
                <button
                    key={account.userId}
                    type="button"
                    role="menuitem"
                    className="status-menu-item status-menu-account"
                    onClick={() => onSwitchAccount?.(account.userId)}
                    data-testid="switch-account"
                >
                    <span className="status-menu-label">
                        {account.displayName}
                        <small>{account.userId}</small>
                    </span>
                </button>
            ))}
            {onAddAccount ? (
                <button type="button" role="menuitem" className="status-menu-item" onClick={onAddAccount} data-testid="add-account">
                    Add an account
                </button>
            ) : null}
            <div className="status-menu-divider" />
            <button type="button" role="menuitem" className="status-menu-item" onClick={() => { onClose(); onOpenSettings(); }}>
                User settings
            </button>
        </div>
    );
}
