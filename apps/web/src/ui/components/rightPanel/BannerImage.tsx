// SPDX-License-Identifier: AGPL-3.0-only
// A profile banner cropped the way its owner chose (point to keep in view + zoom), done with CSS so GIFs keep
// moving. The profile card and the settings preview both use this, at the same shape, so the preview is exact.
import React from "react";

import type { BannerCrop } from "../../../core/profile/richProfile";

export function BannerImage({ url, crop, className }: { url: string; crop: BannerCrop; className?: string }): React.ReactElement {
    return (
        <img
            className={className}
            src={url}
            alt=""
            draggable={false}
            style={{
                objectFit: "cover",
                objectPosition: `${crop.x}% ${crop.y}%`,
                transform: crop.zoom === 1 ? undefined : `scale(${crop.zoom})`,
                transformOrigin: `${crop.x}% ${crop.y}%`,
            }}
        />
    );
}
