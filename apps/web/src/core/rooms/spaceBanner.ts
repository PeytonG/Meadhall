// SPDX-License-Identifier: AGPL-3.0-only
// A server's banner: a picture (or GIF) shown under its name at the top of the channel list, like Discord's. A state
// event in the space, so whoever may change the server's settings can set it.
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

export const SPACE_BANNER_EVENT = "io.github.peytong.meadhall.space_banner";

export function getSpaceBanner(space: Room | null | undefined): string | null {
    const url = space?.currentState.getStateEvents(SPACE_BANNER_EVENT, "")?.getContent()?.url;
    return typeof url === "string" && url.startsWith("mxc://") ? url : null;
}

export function canEditSpaceBanner(space: Room, userId: string): boolean {
    return space.currentState.maySendStateEvent(SPACE_BANNER_EVENT, userId);
}

export async function setSpaceBanner(client: MatrixClient, spaceId: string, mxc: string | null): Promise<void> {
    await client.sendStateEvent(spaceId, SPACE_BANNER_EVENT as never, (mxc ? { url: mxc } : {}) as never, "");
}
