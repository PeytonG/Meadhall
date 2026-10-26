// SPDX-License-Identifier: AGPL-3.0-only
// A poll in the timeline: vote, change your vote, see percentages (live, or once it closes), and close it if it's yours.
import React, { useEffect, useMemo, useState } from "react";
import { PollEvent, RelationsEvent, type MatrixClient, type MatrixEvent, type Poll, type Relations, type Room } from "matrix-js-sdk/src/matrix";

import { PixelIcon } from "../components/PixelIcon";
import { closePoll, sendVote, votesFrom } from "./pollActions";
import { formatTimeLeft, myVote, parsePollStart, percentOf, tallyPoll, type PollVote } from "./pollModel";

interface PollCardProps {
    client: MatrixClient;
    room: Room;
    event: MatrixEvent;
}

function usePoll(room: Room, eventId: string): Poll | undefined {
    const [poll, setPoll] = useState<Poll | undefined>(() => room.polls.get(eventId));
    useEffect(() => {
        setPoll(room.polls.get(eventId));
        const onNew = (created: Poll): void => {
            if (created.pollId === eventId) setPoll(created);
        };
        room.on(PollEvent.New, onNew);
        return () => {
            room.off(PollEvent.New, onNew);
        };
    }, [room, eventId]);
    return poll;
}

// Votes and the poll's end, kept current as people vote.
function usePollState(room: Room, poll: Poll | undefined): { votes: PollVote[]; endTs: number | null; loading: boolean } {
    const [votes, setVotes] = useState<PollVote[]>([]);
    const [endTs, setEndTs] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!poll) return undefined;
        let disposed = false;
        let relations: Relations | undefined;
        const refresh = (): void => {
            if (disposed) return;
            setVotes(votesFrom(relations?.getRelations() ?? []));
            const endEvent = poll.endEventId ? room.findEventById(poll.endEventId) : undefined;
            setEndTs(poll.isEnded ? (endEvent?.getTs() ?? Date.now()) : null);
        };
        const attach = (next: Relations): void => {
            if (relations === next) return refresh();
            relations?.off(RelationsEvent.Add, refresh);
            relations?.off(RelationsEvent.Remove, refresh);
            relations?.off(RelationsEvent.Redaction, refresh);
            relations = next;
            relations.on(RelationsEvent.Add, refresh);
            relations.on(RelationsEvent.Remove, refresh);
            relations.on(RelationsEvent.Redaction, refresh);
            refresh();
        };
        poll.on(PollEvent.Responses, attach);
        poll.on(PollEvent.End, refresh);
        void poll
            .getResponses()
            .then((fetched) => {
                if (!disposed && fetched) attach(fetched);
            })
            .catch(() => undefined)
            .finally(() => {
                if (!disposed) setLoading(false);
            });
        return () => {
            disposed = true;
            poll.off(PollEvent.Responses, attach);
            poll.off(PollEvent.End, refresh);
            relations?.off(RelationsEvent.Add, refresh);
            relations?.off(RelationsEvent.Remove, refresh);
            relations?.off(RelationsEvent.Redaction, refresh);
        };
    }, [room, poll]);
    return { votes, endTs, loading };
}

function displayName(room: Room, userId: string): string {
    return room.getMember(userId)?.name || userId;
}

export function PollCard({ client, room, event }: PollCardProps): React.ReactElement {
    const eventId = event.getId() ?? "";
    const info = useMemo(() => parsePollStart(event.getContent()), [event]);
    const poll = usePoll(room, eventId);
    const { votes, endTs, loading } = usePollState(room, poll);
    const ownUserId = client.getUserId() ?? "";
    const isCreator = event.getSender() === ownUserId;
    const [now, setNow] = useState(() => Date.now());
    const [pending, setPending] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [closingNow, setClosingNow] = useState(false);

    // Tick for the countdown, and to close on time.
    useEffect(() => {
        if (!info?.closesAt || endTs !== null) return undefined;
        const left = info.closesAt - Date.now();
        const timer = window.setTimeout(() => setNow(Date.now()), Math.max(250, Math.min(left, 30_000)));
        return () => window.clearTimeout(timer);
    }, [info?.closesAt, endTs, now]);

    const timeUp = info?.closesAt != null && now >= info.closesAt;
    // Closed by the creator, or its time ran out (whichever came first).
    const closedAt = endTs !== null ? Math.min(endTs, info?.closesAt ?? endTs) : timeUp ? (info?.closesAt ?? null) : null;
    const closed = closedAt !== null;

    // Your app posts the results of your poll when its time is up.
    useEffect(() => {
        if (poll && isCreator && timeUp && endTs === null && info?.closesAt) {
            void closePoll(client, poll, info.closesAt).catch(() => undefined);
        }
    }, [client, poll, isCreator, timeUp, endTs, info?.closesAt]);

    const tally = useMemo(() => (info ? tallyPoll(info, votes, closedAt) : null), [info, votes, closedAt]);
    const confirmedMine = useMemo(() => myVote(votes, ownUserId, closedAt), [votes, ownUserId, closedAt]);
    // Your vote shows right away; the server's copy replaces it when it arrives.
    useEffect(() => {
        if (pending && pending.length === confirmedMine.length && pending.every((id) => confirmedMine.includes(id))) setPending(null);
    }, [pending, confirmedMine]);
    const mine = pending ?? confirmedMine;

    if (!info || !tally) {
        return <div className="timeline-body poll-card poll-card-invalid">This poll can&apos;t be shown.</div>;
    }

    const multi = info.maxSelections > 1;
    const hasVoted = mine.length > 0;
    const showResults = closed || (info.disclosed && (hasVoted || isCreator));

    const vote = async (answerId: string): Promise<void> => {
        if (closed) return;
        let next: string[];
        if (multi) {
            next = mine.includes(answerId) ? mine.filter((id) => id !== answerId) : [...mine, answerId];
            if (next.length > info.maxSelections) {
                setError(`Pick up to ${info.maxSelections}.`);
                return;
            }
        } else {
            if (mine.length === 1 && mine[0] === answerId) return;
            next = [answerId];
        }
        setError(null);
        setPending(next);
        try {
            await sendVote(client, room.roomId, eventId, next);
        } catch (voteError) {
            setPending(null);
            setError(voteError instanceof Error ? `Couldn't vote: ${voteError.message}` : "Couldn't vote.");
        }
    };

    const endNow = async (): Promise<void> => {
        if (!poll) return;
        setClosingNow(true);
        try {
            await closePoll(client, poll);
        } catch (endError) {
            setError(endError instanceof Error ? `Couldn't close the poll: ${endError.message}` : "Couldn't close the poll.");
        } finally {
            setClosingNow(false);
        }
    };

    const votesLabel = tally.totalVoters === 1 ? "1 vote" : `${tally.totalVoters} votes`;
    let status: string;
    if (closed) status = `Final results · ${votesLabel}`;
    else if (!info.disclosed) status = `${votesLabel} · results show when the poll closes`;
    else if (!showResults) status = `${votesLabel} · vote to see the results`;
    else status = votesLabel;
    if (!closed && info.closesAt) status += ` · ${formatTimeLeft(info.closesAt - now)}`;

    return (
        <div className={`poll-card${closed ? " is-closed" : ""}`} data-testid="poll-card" data-poll-id={eventId}>
            <div className="poll-card-head">
                <PixelIcon name="poll" size={16} />
                <span>{closed ? "Poll closed" : "Poll"}</span>
                {info.anonymous ? (
                    <span className="poll-tag" title="Meadhall doesn't show who voted for what. Votes are still Matrix events, so other apps may show them.">
                        Anonymous
                    </span>
                ) : null}
                {multi ? <span className="poll-tag">Pick up to {info.maxSelections}</span> : null}
            </div>
            <div className="poll-card-question">{info.question}</div>
            <div className="poll-answers" role={multi ? "group" : "radiogroup"} aria-label={info.question}>
                {info.answers.map((answer) => {
                    const selected = mine.includes(answer.id);
                    const percent = percentOf(tally, answer.id);
                    const winner = closed && tally.winners.includes(answer.id);
                    const voters = tally.voters[answer.id] ?? [];
                    return (
                        <button
                            key={answer.id}
                            type="button"
                            className={`poll-answer${selected ? " is-selected" : ""}${winner ? " is-winner" : ""}`}
                            role={multi ? "checkbox" : "radio"}
                            aria-checked={selected}
                            disabled={closed || loading}
                            onClick={() => void vote(answer.id)}
                            data-testid="poll-answer"
                        >
                            {showResults ? <span className="poll-answer-fill" style={{ width: `${percent}%` }} aria-hidden="true" /> : null}
                            <span className={`poll-answer-mark${multi ? " is-check" : ""}`} aria-hidden="true" />
                            <span className="poll-answer-text">{answer.text}</span>
                            {showResults ? (
                                <span className="poll-answer-result" data-testid="poll-answer-result">
                                    {percent}% <small>({tally.counts[answer.id]})</small>
                                </span>
                            ) : null}
                            {showResults && !info.anonymous && voters.length > 0 ? (
                                <span className="poll-answer-voters" data-testid="poll-answer-voters">
                                    {voters
                                        .slice(0, 3)
                                        .map((userId) => displayName(room, userId))
                                        .join(", ")}
                                    {voters.length > 3 ? ` +${voters.length - 3}` : ""}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
            <div className="poll-card-foot">
                <span data-testid="poll-status">{status}</span>
                {isCreator && !closed ? (
                    <button type="button" className="poll-end-button" onClick={() => void endNow()} disabled={closingNow || !poll}>
                        {closingNow ? "Closing…" : "Close poll"}
                    </button>
                ) : null}
            </div>
            {error ? <div className="poll-card-error" role="alert">{error}</div> : null}
        </div>
    );
}

// The "poll closed" message: Meadhall shows it as a short line pointing at the poll (its results are on the poll).
export function PollEndNotice({ event }: { event: MatrixEvent }): React.ReactElement {
    const content = event.getContent() as { body?: unknown; "org.matrix.msc1767.text"?: unknown };
    const text = typeof content["org.matrix.msc1767.text"] === "string" ? content["org.matrix.msc1767.text"] : typeof content.body === "string" ? content.body : "The poll has ended.";
    const [first, ...rest] = text.split("\n");
    return (
        <div className="timeline-body poll-end-notice" data-testid="poll-end-notice">
            <PixelIcon name="poll" size={14} /> <strong>{first}</strong>
            {rest.length ? <div className="poll-end-lines">{rest.map((line, index) => <div key={index}>{line}</div>)}</div> : null}
        </div>
    );
}
