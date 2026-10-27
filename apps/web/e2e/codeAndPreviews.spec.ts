// SPDX-License-Identifier: AGPL-3.0-only
// Code blocks with syntax highlighting (typed in Meadhall, or sent as HTML by Element), and link previews:
// shown in normal chats, but not asked for in encrypted ones unless you allow it (the homeserver would see the link).
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendEvent, setAccountData, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function dm(alice: ApiUser, bob: ApiUser, encrypted: boolean): Promise<string> {
    const roomId = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        ...(encrypted ? { initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] } : {}),
    });
    await joinRoom(alice, roomId);
    return roomId;
}

// Previews come from the homeserver; the test server has them off, so answer for it and count the requests.
async function fakePreviews(page: Page): Promise<string[]> {
    const asked: string[] = [];
    await page.route(/\/preview_url\?/, async (route) => {
        asked.push(new URL(route.request().url()).searchParams.get("url") ?? "");
        await route.fulfill({ json: { "og:title": "Example Domain", "og:description": "An example page", "og:site_name": "Example" } });
    });
    return asked;
}

test("code blocks are highlighted, from Meadhall's ``` and from other apps' HTML", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const roomId = await dm(alice, bob, false);
    await setAccountData(alice, "m.direct", { [bob.userId]: [roomId] });
    await sendEvent(bob, roomId, "m.room.message", { msgtype: "m.text", body: "try this:\n```ts\nconst answer: number = 42; // the answer\n```\nand run `pnpm test`" });
    await sendEvent(bob, roomId, "m.room.message", {
        msgtype: "m.text",
        body: "def hi():\n    return 1",
        format: "org.matrix.custom.html",
        formatted_body: '<pre><code class="language-python">def hi():\n    return 1\n</code></pre>',
    });

    await signIn(page, alice);
    await page.getByTestId("home-row").filter({ hasText: "Bob" }).click();
    const blocks = page.locator(".timeline").getByTestId("code-block");
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0)).toHaveAttribute("data-language", "TypeScript");
    await expect(blocks.nth(0).locator(".hljs-keyword").first()).toHaveText("const");
    await expect(blocks.nth(0).locator(".hljs-comment")).toHaveText("// the answer");
    await expect(page.locator(".timeline .inline-code")).toHaveText("pnpm test");
    await expect(blocks.nth(1)).toHaveAttribute("data-language", "Python");
    await expect(blocks.nth(1).locator(".hljs-keyword").first()).toHaveText("def");
    if (process.env.PREVIEW_DIR) await page.locator(".timeline").screenshot({ path: `${process.env.PREVIEW_DIR}/code-blocks.png` });

    // Copy puts the code itself on the clipboard.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await blocks.nth(0).getByRole("button", { name: "Copy code" }).click();
    await expect(blocks.nth(0).getByRole("button", { name: "Copy code" })).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("const answer: number = 42; // the answer");
});

test("link previews: shown in normal chats, not asked for in encrypted ones unless allowed", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    await setDisplayName(carol, "Carol");
    const open = await dm(alice, bob, false);
    const secret = await dm(alice, carol, true);
    await setAccountData(alice, "m.direct", { [bob.userId]: [open], [carol.userId]: [secret] });
    await sendEvent(bob, open, "m.room.message", { msgtype: "m.text", body: "see https://example.com/open" });
    await sendEvent(carol, secret, "m.room.message", { msgtype: "m.text", body: "see https://example.com/secret" });

    const asked = await fakePreviews(page);
    await signIn(page, alice);
    await page.getByTestId("home-row").filter({ hasText: "Bob" }).click();
    await expect(page.locator(".timeline-link-preview")).toContainText("Example Domain");

    await page.getByTestId("home-row").filter({ hasText: "Carol" }).click();
    await expect(page.locator(".timeline")).toContainText("https://example.com/secret");
    await page.waitForTimeout(1500);
    await expect(page.locator(".timeline-link-preview")).toHaveCount(0);
    expect(asked).not.toContain("https://example.com/secret");

    // Allowed everywhere: now it's asked for.
    await page.getByTitle("User settings").click();
    await page.getByRole("button", { name: /Privacy/ }).click();
    await page.getByTestId("link-previews").selectOption("all");
    await page.keyboard.press("Escape");
    await expect(page.locator(".timeline-link-preview")).toContainText("Example Domain");
    expect(asked).toContain("https://example.com/secret");
});
