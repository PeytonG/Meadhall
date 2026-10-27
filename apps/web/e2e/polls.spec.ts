// SPDX-License-Identifier: AGPL-3.0-only
// Polls: made in Meadhall, voted on from Meadhall and from another client, percentages, anonymous polls hide who
// voted, and a poll with a time limit posts its results in the chat when the time is up.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, readEvents, registerUser, sendEvent, setAccountData, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const START = "org.matrix.msc3381.poll.start";
const RESPONSE = "org.matrix.msc3381.poll.response";
const END = "org.matrix.msc3381.poll.end";

async function dmWithBob(alice: ApiUser, bob: ApiUser): Promise<string> {
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    return dm;
}

async function pollEvent(user: ApiUser, roomId: string): Promise<{ id: string; answers: Array<{ id: string; text: string }> }> {
    const events = (await readEvents(user, roomId)) as Array<{ type: string; event_id?: string; content: Record<string, unknown> }>;
    const start = events.find((event) => event.type === START);
    if (!start?.event_id) throw new Error("no poll yet");
    const answers = ((start.content[START] as { answers: Array<Record<string, string>> }).answers ?? []).map((answer) => ({
        id: answer.id,
        text: answer["org.matrix.msc1767.text"],
    }));
    return { id: start.event_id, answers };
}

async function openDm(page: Page, name: string): Promise<void> {
    await page.getByTestId("home-row").filter({ hasText: name }).click();
}

test("make a poll, vote from two apps, see percentages; anonymous hides names; closing posts the results", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await dmWithBob(alice, bob);

    await signIn(page, alice);
    await openDm(page, "Bob");
    await page.getByTestId("composer-poll").click();
    await page.getByTestId("poll-question").fill("Game night?");
    const inputs = page.getByTestId("poll-answer-input");
    await inputs.nth(0).fill("Chess");
    await inputs.nth(1).fill("Go");
    await page.getByTestId("poll-add-answer").click();
    await inputs.nth(2).fill("Tetris");
    await page.getByTestId("poll-anonymous").check();
    await page.getByTestId("poll-create-submit").click();

    const card = page.getByTestId("poll-card");
    await expect(card).toContainText("Game night?");
    await expect(card).toContainText("Anonymous");
    // The creator sees live results straight away (others see them once they vote).
    await expect(card.getByTestId("poll-answer-result")).toHaveCount(3); // the creator sees live results
    const poll = await pollEvent(bob, dm);
    expect(poll.answers.map((answer) => answer.text)).toEqual(["Chess", "Go", "Tetris"]);

    // Bob votes from "another app" (the API), Alice from Meadhall.
    await sendEvent(bob, dm, RESPONSE, { "m.relates_to": { rel_type: "m.reference", event_id: poll.id }, [RESPONSE]: { answers: [poll.answers[1]!.id] } });
    await card.getByTestId("poll-answer").filter({ hasText: "Go" }).click();
    await expect(card.getByTestId("poll-status")).toContainText("2 votes");
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Go" })).toContainText("100%");
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Chess" })).toContainText("0%");
    // Anonymous: no names under the answers.
    await expect(card.getByTestId("poll-answer-voters")).toHaveCount(0);

    // Alice changes her mind: Go 50%, Chess 50%.
    await card.getByTestId("poll-answer").filter({ hasText: "Chess" }).click();
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Chess" })).toContainText("50%");
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Go" })).toContainText("50%");
    if (process.env.PREVIEW_DIR) await card.screenshot({ path: `${process.env.PREVIEW_DIR}/poll.png` });

    // She closes it: a results line appears in the chat, and nobody can vote any more.
    await card.getByRole("button", { name: "Close poll" }).click();
    await expect(page.getByTestId("poll-end-notice")).toContainText('Poll closed: "Game night?" (2 votes)');
    await expect(card.getByTestId("poll-status")).toContainText("Final results");
    await expect(card.getByTestId("poll-answer").first()).toBeDisabled();
    const end = (await readEvents(bob, dm)).find((event) => event.type === END);
    expect(String(end?.content.body)).toContain("Chess: 50% (1)");
    expect(String(end?.content.body)).not.toContain(alice.userId);
});

test("a poll with a time limit closes on time and its creator's app posts the results", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    await setDisplayName(alice, "Alice");
    const dm = await dmWithBob(alice, bob);

    // Alice's poll (made from another device) closes 12 seconds from now; names are shown.
    const closesAt = Date.now() + 12_000;
    await sendEvent(alice, dm, START, {
        [START]: {
            kind: "org.matrix.msc3381.poll.disclosed",
            max_selections: 1,
            question: { "org.matrix.msc1767.text": "Pizza or tacos?" },
            answers: [
                { id: "pizza", "org.matrix.msc1767.text": "Pizza" },
                { id: "tacos", "org.matrix.msc1767.text": "Tacos" },
            ],
        },
        body: "Pizza or tacos?",
        "io.meadhall.poll": { anonymous: false, closes_at: closesAt },
    });
    const poll = await pollEvent(bob, dm);
    await sendEvent(bob, dm, RESPONSE, { "m.relates_to": { rel_type: "m.reference", event_id: poll.id }, [RESPONSE]: { answers: ["tacos"] } });

    await signIn(page, alice);
    await openDm(page, "Bob");
    const card = page.getByTestId("poll-card");
    await expect(card.getByTestId("poll-status")).toContainText("min left");
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Tacos" }).getByTestId("poll-answer-voters")).toHaveText("Bob");

    // Time's up: closed for everyone, and Alice's app posts the results in the chat by itself.
    await expect(card.getByTestId("poll-status")).toContainText("Final results", { timeout: 30_000 });
    await expect(page.getByTestId("poll-end-notice")).toContainText('Poll closed: "Pizza or tacos?" (1 vote)', { timeout: 30_000 });
    await expect(page.getByTestId("poll-end-notice")).toContainText("Tacos: 100% (1)");
    // A late vote doesn't count.
    await sendEvent(bob, dm, RESPONSE, { "m.relates_to": { rel_type: "m.reference", event_id: poll.id }, [RESPONSE]: { answers: ["pizza"] } });
    await page.waitForTimeout(1500);
    await expect(card.getByTestId("poll-answer").filter({ hasText: "Tacos" })).toContainText("100%");
    const ends = (await readEvents(bob, dm)).filter((event) => event.type === END);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.sender).toBe(alice.userId);
});
