// SPDX-License-Identifier: AGPL-3.0-only
import type React from "react";

// Several shared screens: each keeps its 16:9 shape in a grid (2 side by side, then 2 per row, 3 per row from 5),
// and the grid as a whole is sized to fit the window (see .voice-room-stage-video-wrap.is-grid).
export function stageGridStyle(count: number): React.CSSProperties {
    const columns = count <= 1 ? 1 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    return { ["--stage-columns" as string]: columns, ["--stage-rows" as string]: rows };
}
