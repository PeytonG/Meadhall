// SPDX-License-Identifier: AGPL-3.0-only
// "BOT" after the name of one of the server's bots (Server Settings → Bots), like Discord's app tag.
import React from "react";
import type { Room } from "matrix-js-sdk/src/matrix";

import { isServerBot } from "../../../core/bots/serverBots";

export function BotTag({ space, userId }: { space: Room | null; userId: string }): React.ReactElement | null {
    if (!isServerBot(space, userId)) return null;
    return (
        <span className="bot-tag" title="This is one of the space's bots" data-testid="bot-tag">
            BOT
        </span>
    );
}
