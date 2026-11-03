// SPDX-License-Identifier: AGPL-3.0-only
// Attached files, like Discord's attachments but with previews: PDFs show their first page and open in a viewer with
// pages and zoom, Word documents open as formatted text, text files show their first lines, and every file has a
// Download button that saves it under its name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, setAccountData } from "./support/matrixApi";
import { signIn } from "./support/ui";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const PDF = fs.readFileSync(path.join(fixtures, "minutes.pdf"));
const DOCX = fs.readFileSync(path.join(fixtures, "feast-plan.docx"));
const TEXT = Array.from({ length: 100 }, (_, index) => `line ${index + 1}: the mead is flowing`).join("\n");

async function send(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<Locator> {
    await page.locator(".composer-file-input").setInputFiles({ name, mimeType, buffer });
    await page.getByPlaceholder(/^Message /).press("Enter");
    const card = page.getByTestId("file-attachment").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    return card;
}

// True once a canvas has something other than white drawn on it (text on a page).
async function hasInk(canvas: Locator): Promise<boolean> {
    return canvas.evaluate((element: HTMLCanvasElement) => {
        if (!element.width || !element.height) return false;
        const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
        for (let index = 0; index < data.length; index += 4) {
            if (data[index]! < 200 && data[index + 3]! > 0) return true;
        }
        return false;
    });
}

async function openChannel(page: Page): Promise<void> {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Files Hall", channel: "documents" });
    await signIn(page, alice);
    await page.getByTitle("Files Hall").click();
    await page.getByText("#documents", { exact: true }).first().click();
}

test("a PDF shows its first page and page count, opens with pages and zoom, and downloads", async ({ page }) => {
    await openChannel(page);
    const card = await send(page, "minutes.pdf", "application/pdf", PDF);
    await expect(card).toHaveAttribute("data-kind", "pdf");
    await expect(card.getByTestId("file-attachment-meta")).toContainText("2 pages");
    await expect.poll(() => hasInk(card.locator("canvas")), { timeout: 20_000 }).toBe(true);

    await card.getByTestId("file-attachment-open").click();
    const viewer = page.getByTestId("file-viewer");
    await expect(viewer.getByTestId("file-viewer-pages")).toHaveText("2 pages");
    const pages = viewer.locator(".file-viewer-page canvas");
    await expect(pages).toHaveCount(2);
    await expect.poll(() => hasInk(pages.first()), { timeout: 20_000 }).toBe(true);
    const before = (await pages.first().boundingBox())!.width;
    await viewer.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(async () => (await pages.first().boundingBox())!.width).toBeGreaterThan(before + 20);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/pdf-viewer.png` });

    const download = page.waitForEvent("download");
    await viewer.getByTestId("file-viewer-download").click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe("minutes.pdf");
    expect(fs.readFileSync(await saved.path()).equals(PDF)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
});

test("a Word document opens as formatted text, never running what's inside it", async ({ page }) => {
    await openChannel(page);
    const card = await send(page, "feast-plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", DOCX);
    await expect(card.getByTestId("file-attachment-meta")).toContainText("Word document");
    await card.getByTestId("file-attachment-open").click();
    const viewer = page.getByTestId("file-viewer");
    await expect(viewer.locator("strong", { hasText: "Feast plan" })).toBeVisible({ timeout: 20_000 });
    await expect(viewer.locator("em", { hasText: "everyone" })).toBeVisible();
    await expect(viewer).toContainText("<script>alert(1)</script> stays text");
    expect(await viewer.locator("script").count()).toBe(0);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/docx-viewer.png` });
    await viewer.getByRole("button", { name: "Close preview" }).click();
    await expect(viewer).toBeHidden();
});

test("a text file shows its first lines, expands, and opens whole", async ({ page }) => {
    await openChannel(page);
    const card = await send(page, "brewing.log", "text/plain", Buffer.from(TEXT));
    const lines = card.getByTestId("file-attachment-lines");
    await expect(lines).toContainText("line 1: the mead is flowing");
    await expect(lines).toContainText("line 6:");
    await expect(lines).not.toContainText("line 7:");
    await card.getByRole("button", { name: "Expand" }).click();
    await expect(lines).toContainText("line 60:");
    await card.getByRole("button", { name: "View whole file" }).click();
    const viewer = page.getByTestId("file-viewer");
    await expect(viewer.getByTestId("code-block")).toContainText("line 100: the mead is flowing", { timeout: 20_000 });
    await page.keyboard.press("Escape");
});

test("any other file downloads from its card", async ({ page }) => {
    await openChannel(page);
    const card = await send(page, "save-game.bin", "application/octet-stream", Buffer.from([1, 2, 3, 4, 5]));
    await expect(card).toHaveAttribute("data-kind", "other");
    const download = page.waitForEvent("download");
    await card.getByTestId("file-attachment-download").click();
    expect((await download).suggestedFilename()).toBe("save-game.bin");
});

test("files in an encrypted DM preview and download too", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    const card = await send(page, "minutes.pdf", "application/pdf", PDF);
    await expect(card.getByTestId("file-attachment-meta")).toContainText("2 pages", { timeout: 30_000 });
    const download = page.waitForEvent("download");
    await card.getByTestId("file-attachment-download").click();
    const saved = await download;
    expect(fs.readFileSync(await saved.path()).equals(PDF)).toBe(true);
});
