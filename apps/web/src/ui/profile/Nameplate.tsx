// SPDX-License-Identifier: AGPL-3.0-only
// Someone's nameplate (Settings → Profile → Profile style) behind their row in member lists, fading in from the right
// like Discord's so the name stays readable.
import React from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { gradientColors, gradientCss } from "../../core/profile/profileStyle";
import { useIconStyle } from "../theme/iconStyle";
import { useProfileStyle } from "./useProfileStyle";

export function NameplateBackground({ client, userId }: { client: MatrixClient; userId: string }): React.ReactElement | null {
    const pixel = useIconStyle() === "pixel";
    const colors = gradientColors(useProfileStyle(client, userId).nameplate);
    if (!colors) return null;
    return <span className="nameplate-bg" aria-hidden="true" data-testid="nameplate" style={{ backgroundImage: gradientCss(colors, { pixel, angle: 90 }) }} />;
}
