// SPDX-License-Identifier: AGPL-3.0-only
// Translations: pick a language on the sign-in screen and the app follows (settings, message box, call controls
// via the same t()); "System default" follows the browser; English stays as it was.
import { expect, test } from "@playwright/test";

import { seedHall } from "./support/seedHall";

test("choosing Spanish on the sign-in screen carries into the app, and back to English", async ({ page }) => {
    const hall = await seedHall();
    await page.goto("/");
    await page.getByTestId("login-language").selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("form").getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    await page.getByLabel("Usuario o correo").fill(hall.viewer.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(hall.viewer.password);
    await page.locator("form").getByRole("button", { name: "Iniciar sesión" }).click();
    const skip = page.getByRole("button", { name: "Skip for now" });
    const home = page.getByTestId("rail-home");
    await expect(home.or(skip).first()).toBeVisible({ timeout: 60_000 });
    if (await skip.isVisible()) await skip.click();

    await page.getByTitle("The Mead Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.locator(".composer-textarea")).toHaveAttribute("placeholder", "Mensaje a #general");

    await page.getByTitle("User settings").click();
    await expect(page.getByRole("button", { name: "Privacidad y seguridad", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apariencia", exact: true }).click();
    if (process.env.PREVIEW_DIR) await page.locator(".settings-nav").screenshot({ path: `${process.env.PREVIEW_DIR}/language.png` });
    await page.getByTestId("language-select").selectOption("en");
    await expect(page.getByRole("button", { name: "Privacy & Safety", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test.describe("with a German browser", () => {
    test.use({ locale: "de-DE" });
    test("System default picks German", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.locator("form").getByRole("button", { name: "Anmelden" })).toBeVisible();
    });
});
