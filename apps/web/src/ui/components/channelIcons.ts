// SPDX-License-Identifier: AGPL-3.0-only
// Which icon a channel shows in the channel list, its header and the create dialog.
import type { ChannelType } from "../../core/rooms/channelType";
import type { PixelIconName } from "./PixelIcon";

export function channelTypeIcon(type: ChannelType | "voice"): PixelIconName {
    switch (type) {
        case "voice":
            return "voice";
        case "rules":
            return "rules";
        case "faq":
            return "faq";
        case "news":
            return "news";
        case "events":
            return "events";
        default:
            return "hash";
    }
}
