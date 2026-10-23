// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Updates (desktop): go back to an earlier release if an update causes trouble.
import React, { useEffect, useState } from "react";

import {
    FIRST_VERSION_WITH_ROLLBACK,
    cannotRollBackFrom,
    fetchReleaseChoices,
    type ReleaseChoice,
} from "../../../../core/updates/releaseHistory";

export function EarlierVersions({ currentVersion, busy }: { currentVersion: string | null; busy: boolean }): React.ReactElement | null {
    const [choices, setChoices] = useState<ReleaseChoice[] | null>(null);
    const [selected, setSelected] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [installing, setInstalling] = useState(false);
    const installVersion = window.heorotDesktop?.installVersion;

    useEffect(() => {
        if (!currentVersion || !installVersion) return;
        let cancelled = false;
        void fetchReleaseChoices(currentVersion)
            .then((list) => {
                if (!cancelled) setChoices(list);
            })
            .catch((fetchError: unknown) => {
                if (!cancelled) setError(fetchError instanceof Error ? `Couldn't list releases: ${fetchError.message}` : "Couldn't list releases.");
            });
        return () => {
            cancelled = true;
        };
    }, [currentVersion, installVersion]);

    if (!installVersion) return null;
    const noWayBack = selected !== "" && cannotRollBackFrom(selected);

    const install = (): void => {
        if (!selected) return;
        const question = noWayBack
            ? `Install Meadhall ${selected}? From ${selected} you can't pick other versions: you'd have to update to the newest version first.`
            : `Install Meadhall ${selected}? Meadhall restarts when it's done.`;
        if (!window.confirm(question)) return;
        setInstalling(true);
        setError(null);
        void installVersion(selected)
            .then((result) => {
                if (!result.ok) setError(result.message ?? "Couldn't install that version.");
            })
            .finally(() => setInstalling(false));
    };

    return (
        <div className="settings-section-card" data-testid="earlier-versions">
            <h3>Install an earlier version</h3>
            <p className="settings-tab-description">
                If an update causes trouble, go back to an earlier release. Meadhall downloads it, installs it and restarts.
            </p>
            <div className="settings-theme-row">
                <select
                    className="room-dialog-input"
                    aria-label="Version to install"
                    value={selected}
                    disabled={!choices || busy || installing}
                    onChange={(event) => setSelected(event.target.value)}
                >
                    <option value="">{choices ? "Choose a version" : "Loading versions…"}</option>
                    {(choices ?? []).map((choice) => (
                        <option key={choice.version} value={choice.version}>
                            {choice.version}
                            {choice.publishedAt ? ` (${new Date(choice.publishedAt).toLocaleDateString()})` : ""}
                        </option>
                    ))}
                </select>
                <button type="button" className="settings-button settings-button-secondary" disabled={!selected || busy || installing} onClick={install}>
                    {installing ? "Downloading…" : selected ? `Install ${selected}` : "Install"}
                </button>
            </div>
            {noWayBack ? (
                <p className="settings-inline-warning" role="alert" data-testid="rollback-warning">
                    Choosing other versions arrived in {FIRST_VERSION_WITH_ROLLBACK}. Once you&apos;re on {selected}, you
                    can&apos;t go to another older version without first updating to the newest one.
                </p>
            ) : null}
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}
