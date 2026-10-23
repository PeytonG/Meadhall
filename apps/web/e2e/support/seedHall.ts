// SPDX-License-Identifier: AGPL-3.0-only
// A small demo community for screenshots and layout checks: a space with text and voice channels, a DM and a
// group chat. Returns the user to sign in as (Beowulf) and the room IDs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    createRoom,
    joinRoom,
    registerUser,
    sendMessage,
    sendState,
    sendStickerEvent,
    setAccountData,
    setDisplayName,
    type ApiUser,
} from "./matrixApi";

export interface SeededHall {
    viewer: ApiUser;
    // Everyone in the hall; Hrothgar owns the space.
    users: { hrothgar: ApiUser; beowulf: ApiUser; wealhtheow: ApiUser; wiglaf: ApiUser };
    spaceId: string;
    generalId: string;
    dmId: string;
    groupId: string;
}

export async function seedHall(): Promise<SeededHall> {
    const [hrothgar, beowulf, wealhtheow, wiglaf] = await Promise.all(
        ["hrothgar", "beowulf", "wealhtheow", "wiglaf"].map((name) => registerUser(name)),
    );
    await Promise.all([
        setDisplayName(hrothgar, "Hrothgar"),
        setDisplayName(beowulf, "Beowulf"),
        setDisplayName(wealhtheow, "Wealhtheow"),
        setDisplayName(wiglaf, "Wiglaf"),
    ]);
    const guests = [beowulf, wealhtheow, wiglaf];
    const spaceId = await createRoom(hrothgar, {
        name: "The Mead Hall",
        preset: "private_chat",
        creation_content: { type: "m.space" },
        invite: guests.map((guest) => guest.userId),
    });

    const channel = async (name: string, topic: string, voice = false): Promise<string> => {
        const roomId = await createRoom(hrothgar, {
            name,
            topic,
            preset: "private_chat",
            invite: guests.map((guest) => guest.userId),
            initial_state: [
                { type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } },
                ...(voice
                    ? [
                          { type: "org.heorot.voice_channel", state_key: "", content: { enabled: true, version: 1 } },
                          { type: "org.matrix.msc3401.call", state_key: "", content: { type: "voice", intent: "voice" } },
                      ]
                    : []),
            ],
        });
        await sendState(hrothgar, spaceId, "m.space.child", roomId, {
            via: ["localhost"],
            suggested: true,
            ...(voice ? { "org.heorot.channel_type": "voice", "org.heorot.voice_channel": true } : {}),
        });
        for (const guest of guests) await joinRoom(guest, roomId);
        return roomId;
    };

    for (const guest of guests) await joinRoom(guest, spaceId);
    const generalId = await channel("general", "Gather round the hearth");
    await channel("announcements", "News from the high seat");
    await channel("sagas", "Tales worth retelling");
    await channel("Fireside", "Voice chat by the fire", true);

    const conversation: Array<[ApiUser, string]> = [
        [hrothgar, "Welcome to the hall, everyone. The mead is poured and the fire is lit."],
        [beowulf, "Glad to be here! Voice works with Element Call too, so bring your friends."],
        [wealhtheow, "The pixel color wheel is great: I set my hall to crimson."],
        [wiglaf, "Anyone up for a game in the Fireside channel later?"],
        [hrothgar, "Count me in. Messages and calls here are end-to-end encrypted, as a hall should be."],
        [beowulf, "Then it's settled: Fireside at sundown."],
    ];
    for (const [author, text] of conversation) await sendMessage(author, generalId, text);
    const cheers = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/ui/assets/stickers/cheers.png"));
    await sendStickerEvent(wiglaf, generalId, cheers, "Cheers");

    // A one-to-one DM (Hrothgar -> Beowulf) and a group chat (Wealhtheow, Wiglaf and Beowulf).
    const dmId = await createRoom(hrothgar, { is_direct: true, preset: "trusted_private_chat", invite: [beowulf.userId] });
    await joinRoom(beowulf, dmId);
    await sendMessage(hrothgar, dmId, "Beowulf, a word before the feast?");
    await sendMessage(beowulf, dmId, "Always, my lord.");
    const groupId = await createRoom(wealhtheow, {
        name: "Shieldwall",
        preset: "private_chat",
        invite: [beowulf.userId, wiglaf.userId],
    });
    await joinRoom(beowulf, groupId);
    await joinRoom(wiglaf, groupId);
    await sendMessage(wealhtheow, groupId, "Who's bringing the shields tonight?");
    await setAccountData(beowulf, "m.direct", { [hrothgar.userId]: [dmId], [wealhtheow.userId]: [groupId], [wiglaf.userId]: [groupId] });

    return { viewer: beowulf, users: { hrothgar, beowulf, wealhtheow, wiglaf }, spaceId, generalId, dmId, groupId };
}
