// SPDX-License-Identifier: AGPL-3.0-only
// Polls (MSC3381, the unstable event names Element uses too, so polls work across clients).
// Meadhall adds a few fields other clients ignore: an anonymous flag (Meadhall doesn't show who voted)
// and a closing time (votes after it don't count, and the creator's app posts the results).
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

export const POLL_START_TYPE = "org.matrix.msc3381.poll.start";
export const POLL_RESPONSE_TYPE = "org.matrix.msc3381.poll.response";
export const POLL_END_TYPE = "org.matrix.msc3381.poll.end";
const STABLE_START = "m.poll.start";
const STABLE_RESPONSE = "m.poll.response";
const STABLE_END = "m.poll.end";
const TEXT = "org.matrix.msc1767.text";
const KIND_DISCLOSED = "org.matrix.msc3381.poll.disclosed";
const KIND_UNDISCLOSED = "org.matrix.msc3381.poll.undisclosed";
export const MEADHALL_POLL = "io.meadhall.poll";

export const MAX_POLL_ANSWERS = 20;
export const MAX_POLL_TEXT = 340;

export interface PollAnswerInfo {
    id: string;
    text: string;
}

export interface PollInfo {
    question: string;
    answers: PollAnswerInfo[];
    maxSelections: number;
    // Live results (disclosed) or only once it ends (undisclosed).
    disclosed: boolean;
    anonymous: boolean;
    closesAt: number | null;
}

export interface PollVote {
    sender: string;
    ts: number;
    answers: string[];
}

export interface PollTally {
    counts: Record<string, number>;
    voters: Record<string, string[]>;
    // People who voted (each counted once, whatever they picked).
    totalVoters: number;
    // Picks across everyone (multi-choice polls can have more picks than voters).
    totalVotes: number;
    winners: string[];
}

export function isPollStartType(type: string): boolean {
    return type === POLL_START_TYPE || type === STABLE_START;
}

export function isPollResponseType(type: string): boolean {
    return type === POLL_RESPONSE_TYPE || type === STABLE_RESPONSE;
}

export function isPollEndType(type: string): boolean {
    return type === POLL_END_TYPE || type === STABLE_END;
}

function textOf(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const direct = record[TEXT] ?? record["m.text"] ?? record.body;
    if (typeof direct === "string") return direct;
    // Stable form: an array of { body, mimetype }.
    if (Array.isArray(direct)) {
        const plain = direct.find((entry) => entry && typeof entry === "object" && typeof (entry as { body?: unknown }).body === "string");
        return plain ? (plain as { body: string }).body : "";
    }
    return "";
}

export function parsePollStart(content: Record<string, unknown>): PollInfo | null {
    const start = (content[POLL_START_TYPE] ?? content[STABLE_START]) as Record<string, unknown> | undefined;
    if (!start || typeof start !== "object") return null;
    const question = textOf(start.question).trim();
    const rawAnswers = Array.isArray(start.answers) ? start.answers : [];
    const answers: PollAnswerInfo[] = [];
    const seen = new Set<string>();
    for (const raw of rawAnswers.slice(0, MAX_POLL_ANSWERS)) {
        if (!raw || typeof raw !== "object") continue;
        const id = (raw as { id?: unknown; "m.id"?: unknown }).id ?? (raw as { "m.id"?: unknown })["m.id"];
        const text = textOf(raw).trim();
        if (typeof id !== "string" || !id || seen.has(id) || !text) continue;
        seen.add(id);
        answers.push({ id, text });
    }
    if (!question || answers.length < 1) return null;
    const max = typeof start.max_selections === "number" && Number.isFinite(start.max_selections) ? Math.floor(start.max_selections) : 1;
    const extra = (content[MEADHALL_POLL] ?? {}) as { anonymous?: unknown; closes_at?: unknown };
    const closesAt = typeof extra.closes_at === "number" && Number.isFinite(extra.closes_at) && extra.closes_at > 0 ? extra.closes_at : null;
    const kind = typeof start.kind === "string" ? start.kind : KIND_DISCLOSED;
    return {
        question,
        answers,
        maxSelections: Math.min(Math.max(max, 1), answers.length),
        disclosed: kind !== KIND_UNDISCLOSED && kind !== "m.poll.undisclosed",
        anonymous: extra.anonymous === true,
        closesAt,
    };
}

export function parsePollResponse(content: Record<string, unknown>): string[] | null {
    const response = (content[POLL_RESPONSE_TYPE] ?? content[STABLE_RESPONSE]) as { answers?: unknown } | undefined;
    if (!response || typeof response !== "object") return null;
    return Array.isArray(response.answers) ? response.answers.filter((answer): answer is string => typeof answer === "string") : [];
}

export function voteFromEvent(event: MatrixEvent): PollVote | null {
    if (!isPollResponseType(event.getType()) || event.isRedacted()) return null;
    const answers = parsePollResponse(event.getContent());
    const sender = event.getSender();
    if (!answers || !sender) return null;
    return { sender, ts: event.getTs(), answers };
}

// MSC3381 counting: each person's latest vote before the poll closed. A vote with an unknown answer or too many
// picks is "spoiled" (counts as no vote), as other clients do.
export function tallyPoll(info: PollInfo, votes: PollVote[], closedAt: number | null): PollTally {
    const valid = new Set(info.answers.map((answer) => answer.id));
    const latest = new Map<string, PollVote>();
    for (const vote of votes) {
        if (closedAt !== null && vote.ts > closedAt) continue;
        const current = latest.get(vote.sender);
        if (!current || vote.ts >= current.ts) latest.set(vote.sender, vote);
    }
    const counts: Record<string, number> = Object.fromEntries(info.answers.map((answer) => [answer.id, 0]));
    const voters: Record<string, string[]> = Object.fromEntries(info.answers.map((answer) => [answer.id, [] as string[]]));
    let totalVoters = 0;
    let totalVotes = 0;
    for (const [sender, vote] of latest) {
        const picks = [...new Set(vote.answers)];
        if (picks.length === 0 || picks.length > info.maxSelections || picks.some((pick) => !valid.has(pick))) continue;
        totalVoters += 1;
        for (const pick of picks) {
            counts[pick] += 1;
            voters[pick].push(sender);
            totalVotes += 1;
        }
    }
    const top = Math.max(0, ...Object.values(counts));
    const winners = top > 0 ? info.answers.filter((answer) => counts[answer.id] === top).map((answer) => answer.id) : [];
    return { counts, voters, totalVoters, totalVotes, winners };
}

// Share of the people who voted (like Teams: multi-choice percentages can add up to more than 100).
export function percentOf(tally: PollTally, answerId: string): number {
    return tally.totalVoters > 0 ? Math.round(((tally.counts[answerId] ?? 0) / tally.totalVoters) * 100) : 0;
}

export function myVote(votes: PollVote[], userId: string, closedAt: number | null): string[] {
    let mine: PollVote | null = null;
    for (const vote of votes) {
        if (vote.sender !== userId || (closedAt !== null && vote.ts > closedAt)) continue;
        if (!mine || vote.ts >= mine.ts) mine = vote;
    }
    return mine?.answers ?? [];
}

function answerId(index: number): string {
    return `${index + 1}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NewPoll {
    question: string;
    answers: string[];
    maxSelections: number;
    disclosed: boolean;
    anonymous: boolean;
    // Minutes until it closes, or null for no limit.
    durationMinutes: number | null;
}

export function buildPollStartContent(poll: NewPoll, now = Date.now()): Record<string, unknown> {
    const question = poll.question.trim().slice(0, MAX_POLL_TEXT);
    const answers = poll.answers
        .map((answer) => answer.trim().slice(0, MAX_POLL_TEXT))
        .filter(Boolean)
        .slice(0, MAX_POLL_ANSWERS)
        .map((text, index) => ({ id: answerId(index), [TEXT]: text }));
    if (!question) throw new Error("The poll needs a question.");
    if (answers.length < 2) throw new Error("The poll needs at least two answers.");
    const closesAt = poll.durationMinutes ? now + poll.durationMinutes * 60_000 : null;
    const fallback = `${question}\n${answers.map((answer, index) => `${index + 1}. ${answer[TEXT]}`).join("\n")}`;
    return {
        [POLL_START_TYPE]: {
            kind: poll.disclosed ? KIND_DISCLOSED : KIND_UNDISCLOSED,
            max_selections: Math.min(Math.max(Math.floor(poll.maxSelections), 1), answers.length),
            question: { [TEXT]: question },
            answers,
        },
        [TEXT]: fallback,
        body: fallback,
        [MEADHALL_POLL]: { anonymous: poll.anonymous, ...(closesAt ? { closes_at: closesAt } : {}) },
    };
}

export function buildPollResponseContent(pollEventId: string, answers: string[]): Record<string, unknown> {
    return {
        "m.relates_to": { rel_type: "m.reference", event_id: pollEventId },
        [POLL_RESPONSE_TYPE]: { answers },
    };
}

export function resultsSummary(info: PollInfo, tally: PollTally): string {
    if (tally.totalVoters === 0) return `Poll closed: "${info.question}". Nobody voted.`;
    const lines = info.answers.map((answer) => `${answer.text}: ${percentOf(tally, answer.id)}% (${tally.counts[answer.id]})`);
    const people = tally.totalVoters === 1 ? "1 vote" : `${tally.totalVoters} votes`;
    return `Poll closed: "${info.question}" (${people})\n${lines.join("\n")}`;
}

export function buildPollEndContent(pollEventId: string, info: PollInfo, tally: PollTally): Record<string, unknown> {
    const summary = resultsSummary(info, tally);
    return {
        "m.relates_to": { rel_type: "m.reference", event_id: pollEventId },
        [POLL_END_TYPE]: {},
        [TEXT]: summary,
        body: summary,
        [MEADHALL_POLL]: { counts: tally.counts, total_voters: tally.totalVoters },
    };
}

export function formatTimeLeft(ms: number): string {
    if (ms <= 0) return "closing…";
    const minutes = Math.ceil(ms / 60_000);
    if (minutes < 60) return `${minutes} min left`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h left`;
    return `${Math.round(hours / 24)} days left`;
}
