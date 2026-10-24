// SPDX-License-Identifier: AGPL-3.0-only
// A space's picture in the server rail. Tries the thumbnail, then the full picture (some images can't be thumbnailed by
// the server, and remote servers sometimes fail to), then falls back to the space's initials instead of a broken image.
import React, { useEffect, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { roomAvatarSources } from "../adapters/avatar";

interface RailSpaceIconProps {
    client: MatrixClient;
    space: Room;
    glyph: string;
}

export function RailSpaceIcon({ client, space, glyph }: RailSpaceIconProps): React.ReactElement {
    const mxc = space.getMxcAvatarUrl();
    const sources = React.useMemo(() => (mxc ? roomAvatarSources(client, space, 48, false) : []), [client, mxc, space]);
    const [index, setIndex] = useState(0);
    useEffect(() => setIndex(0), [sources]);
    const src = sources[index];
    if (!src) return <>{glyph}</>;
    return <img src={src} alt="" className="rail-icon-avatar" onError={() => setIndex((current) => current + 1)} data-testid="rail-space-image" />;
}
