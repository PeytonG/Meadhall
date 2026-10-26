// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    POLL_START_TYPE,
    buildPollEndContent,
    buildPollStartContent,
    myVote,
    parsePollStart,
    percentOf,
    resultsSummary,
    tallyPoll,
    type PollInfo,
} from "../../../../src/ui/polls/pollModel";

function makePoll(overrides: Partial<Parameters<typeof buildPollStartContent>[0]> = {}): { content: Record<string, unknown>; info: PollInfo } {
    const content = buildPollStartContent(
        { question: "Game?", answers: ["Chess", "Go", "Tetris"], maxSelections: 1, disclosed: true, anonymous: false, durationMinutes: null, ...overrides },
        1_000,
    );
    return { content, info: parsePollStart(content)! };
}

describe("polls", () => {
    it("builds a poll other Matrix apps understand, and reads it back", () => {
        const { content, info } = makePoll({ anonymous: true, durationMinutes: 60, disclosed: false });
        const start = content[POLL_START_TYPE] as { kind: string; answers: Array<{ id: string }>; max_selections: number };
        expect(start.kind).toBe("org.matrix.msc3381.poll.undisclosed");
        expect(start.max_selections).toBe(1);
        expect(new Set(start.answers.map((answer) => answer.id)).size).toBe(3);
        expect(content.body).toContain("1. Chess");
        expect(info).toMatchObject({ question: "Game?", anonymous: true, disclosed: false, closesAt: 1_000 + 3_600_000, maxSelections: 1 });
        expect(info.answers.map((answer) => answer.text)).toEqual(["Chess", "Go", "Tetris"]);
    });

    it("needs a question and two answers; drops blanks", () => {
        expect(() => buildPollStartContent({ question: " ", answers: ["a", "b"], maxSelections: 1, disclosed: true, anonymous: false, durationMinutes: null })).toThrow(/question/);
        expect(() => buildPollStartContent({ question: "q", answers: ["a", "  "], maxSelections: 1, disclosed: true, anonymous: false, durationMinutes: null })).toThrow(/two answers/);
    });

    it("reads Element's polls (no Meadhall fields): open, live results, not anonymous", () => {
        const info = parsePollStart({
            [POLL_START_TYPE]: {
                kind: "org.matrix.msc3381.poll.disclosed",
                question: { "org.matrix.msc1767.text": "Lunch?" },
                answers: [
                    { id: "a", "org.matrix.msc1767.text": "Pizza" },
                    { id: "b", "org.matrix.msc1767.text": "Soup" },
                ],
            },
        });
        expect(info).toMatchObject({ question: "Lunch?", disclosed: true, anonymous: false, closesAt: null, maxSelections: 1 });
    });

    it("rejects junk: no question, no answers, duplicate ids, a bad closing time", () => {
        expect(parsePollStart({})).toBeNull();
        expect(parsePollStart({ [POLL_START_TYPE]: { question: { body: "q" }, answers: [] } })).toBeNull();
        const info = parsePollStart({
            [POLL_START_TYPE]: {
                question: { body: "q" },
                max_selections: 99,
                answers: [
                    { id: "a", body: "A" },
                    { id: "a", body: "dupe" },
                    { id: "b", body: "B" },
                ],
            },
            "io.meadhall.poll": { closes_at: "soon" },
        });
        expect(info?.answers.map((answer) => answer.id)).toEqual(["a", "b"]);
        expect(info?.maxSelections).toBe(2);
        expect(info?.closesAt).toBeNull();
    });

    it("counts each person's latest vote before it closed; spoiled votes don't count", () => {
        const { info } = makePoll();
        const [chess, go, tetris] = info.answers.map((answer) => answer.id);
        const votes = [
            { sender: "@a", ts: 10, answers: [chess] },
            { sender: "@a", ts: 20, answers: [go] }, // changed her mind
            { sender: "@b", ts: 15, answers: [go] },
            { sender: "@c", ts: 16, answers: [tetris, go] }, // too many picks: spoiled
            { sender: "@d", ts: 17, answers: ["nope"] }, // unknown answer: spoiled
            { sender: "@e", ts: 99, answers: [chess] }, // after it closed
        ];
        const tally = tallyPoll(info, votes, 50);
        expect(tally.counts).toEqual({ [chess]: 0, [go]: 2, [tetris]: 0 });
        expect(tally.totalVoters).toBe(2);
        expect(tally.winners).toEqual([go]);
        expect(percentOf(tally, go)).toBe(100);
        expect(tally.voters[go]).toEqual(["@a", "@b"]);
        expect(myVote(votes, "@a", 50)).toEqual([go]);
        expect(myVote(votes, "@e", 50)).toEqual([]);
        // Still open: the late vote counts.
        expect(tallyPoll(info, votes, null).counts[chess]).toBe(1);
    });

    it("multi-choice percentages are per voter, like Teams", () => {
        const { info } = makePoll({ maxSelections: 3 });
        const [chess, go, tetris] = info.answers.map((answer) => answer.id);
        const tally = tallyPoll(
            info,
            [
                { sender: "@a", ts: 1, answers: [chess, go] },
                { sender: "@b", ts: 2, answers: [go, tetris] },
                { sender: "@c", ts: 3, answers: [] }, // took the vote back
            ],
            null,
        );
        expect(tally.totalVoters).toBe(2);
        expect(tally.totalVotes).toBe(4);
        expect(percentOf(tally, go)).toBe(100);
        expect(percentOf(tally, chess)).toBe(50);
    });

    it("the closing message has the results, and no names", () => {
        const { info } = makePoll({ anonymous: true });
        const [chess, go] = info.answers.map((answer) => answer.id);
        const tally = tallyPoll(info, [{ sender: "@alice:example.org", ts: 1, answers: [chess] }, { sender: "@bob:example.org", ts: 2, answers: [go] }, { sender: "@carol:example.org", ts: 3, answers: [go] }], null);
        const summary = resultsSummary(info, tally);
        expect(summary).toContain('Poll closed: "Game?" (3 votes)');
        expect(summary).toContain("Go: 67% (2)");
        expect(summary).toContain("Chess: 33% (1)");
        expect(summary).not.toMatch(/alice|bob|carol/);
        const end = buildPollEndContent("$poll", info, tally);
        expect(end["m.relates_to"]).toEqual({ rel_type: "m.reference", event_id: "$poll" });
        expect(end.body).toBe(summary);
        expect(resultsSummary(info, tallyPoll(info, [], null))).toContain("Nobody voted");
    });
});
