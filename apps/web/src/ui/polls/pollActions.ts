// SPDX-License-Identifier: AGPL-3.0-only
// Sending votes and closing polls (by hand, or by the creator's app once the time limit passes).
import { type MatrixClient, type MatrixEvent, type Poll } from "matrix-js-sdk/src/matrix";

import {
    POLL_END_TYPE,
    POLL_RESPONSE_TYPE,
    POLL_START_TYPE,
    buildPollEndContent,
    buildPollResponseContent,
    buildPollStartContent,
    parsePollStart,
    tallyPoll,
    voteFromEvent,
    type NewPoll,
    type PollVote,
} from "./pollModel";

type SendEvent = (roomId: string, type: string, content: Record<string, unknown>) => Promise<unknown>;

function sender(client: MatrixClient): SendEvent {
    return client.sendEvent.bind(client) as unknown as SendEvent;
}

export async function sendPoll(client: MatrixClient, roomId: string, poll: NewPoll): Promise<void> {
    await sender(client)(roomId, POLL_START_TYPE, buildPollStartContent(poll));
}

export async function sendVote(client: MatrixClient, roomId: string, pollEventId: string, answers: string[]): Promise<void> {
    await sender(client)(roomId, POLL_RESPONSE_TYPE, buildPollResponseContent(pollEventId, answers));
}

export function votesFrom(events: MatrixEvent[]): PollVote[] {
    return events.map(voteFromEvent).filter((vote): vote is PollVote => vote !== null);
}

// One close per poll from this app, however many cards or timers ask.
const closing = new Set<string>();

export async function closePoll(client: MatrixClient, poll: Poll, closedAt = Date.now()): Promise<void> {
    if (poll.isEnded || closing.has(poll.pollId)) return;
    const info = parsePollStart(poll.rootEvent.getContent());
    if (!info) return;
    closing.add(poll.pollId);
    try {
        const responses = await poll.getResponses();
        const tally = tallyPoll(info, votesFrom(responses?.getRelations() ?? []), closedAt);
        await sender(client)(poll.roomId, POLL_END_TYPE, buildPollEndContent(poll.pollId, info, tally));
    } catch (error) {
        closing.delete(poll.pollId);
        throw error;
    }
}

// The creator's app posts the results of their polls whose time is up (the others already show them as closed).
export function closeExpiredPolls(client: MatrixClient, now = Date.now()): void {
    const ownUserId = client.getUserId();
    if (!ownUserId) return;
    for (const room of client.getRooms()) {
        if (room.getMyMembership() !== "join") continue;
        for (const poll of room.polls.values()) {
            if (poll.isEnded || poll.rootEvent.getSender() !== ownUserId) continue;
            const closesAt = parsePollStart(poll.rootEvent.getContent())?.closesAt;
            if (closesAt && closesAt <= now) void closePoll(client, poll, closesAt).catch(() => undefined);
        }
    }
}
