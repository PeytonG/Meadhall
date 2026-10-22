// SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo } from "react";

import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { CAMPFIRE_GRID, campfireFrames, campfirePaths, flamePalette } from "../../voice/campfire";
import { useFlameStyle } from "../../voice/flameColor";

interface PixelCampfireProps {
    // Shown (and animated) only while the person talks.
    active: boolean;
    color: string;
    className?: string;
}

// The fire's frames are the same for everyone; only the palette changes, so the paths are built once.
let sharedFramePaths: string[][] | null = null;

export function PixelCampfire({ active, color, className }: PixelCampfireProps): React.ReactElement {
    sharedFramePaths ??= campfireFrames().map(campfirePaths);
    const palette = useMemo(() => flamePalette(color), [color]);
    return (
        <svg
            className={`pixel-campfire${active ? " is-burning" : ""}${className ? ` ${className}` : ""}`}
            viewBox={`0 0 ${CAMPFIRE_GRID} ${CAMPFIRE_GRID}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
            data-testid="pixel-campfire"
        >
            {sharedFramePaths.map((paths, frame) => (
                <g key={frame} className={`pixel-campfire-frame pixel-campfire-frame-${frame}`}>
                    {paths.slice(1).map((d, level) => (d ? <path key={level} d={d} fill={palette[level]} /> : null))}
                </g>
            ))}
        </svg>
    );
}

// The speaking indicator for a call participant: their campfire in the color they picked, or, if they turned the
// campfire off, the plain green ring (`ringClassName`, styled per place it appears). Read from their profile.
export function SpeakingCampfire({
    client,
    userId,
    active,
    ringClassName,
}: {
    client: MatrixClient;
    userId: string | null | undefined;
    active: boolean;
    ringClassName: string;
}): React.ReactElement {
    const style = useFlameStyle(client, userId);
    if (!style.enabled) {
        return <span className={`${ringClassName}${active ? " is-speaking" : ""}`} aria-hidden="true" />;
    }
    return <PixelCampfire active={active} color={style.color} />;
}
