import { expect, test } from "@playwright/test";

test("contractor happy path produces a Google Doc", async ({ page }) => {
  await page.goto("/recap/new");
  await page.getByTestId("audio-input").setInputFiles({
    name: "recap.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("fake-audio")
  });
  await page.getByRole("button", { name: "Upload Selected Audio" }).click();

  await expect(page.getByRole("link", { name: "Open generated draft" })).toBeVisible();
});

test("missing fields path asks follow-up questions and can recover", async ({ page }) => {
  await page.goto("/recap/new");
  await page.getByTestId("audio-input").setInputFiles({
    name: "missing-fields.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("missing-fields")
  });
  await page.getByRole("button", { name: "Upload Selected Audio" }).click();

  await expect(page.getByRole("heading", { name: "Follow-up prompts" })).toBeVisible();
  await page.getByTestId("follow-up-couple_names").fill("Jamie and Riley");
  await page.getByTestId("follow-up-venue_name").fill("Bella Collina");
  await page.getByTestId("follow-up-venue_city_state").fill("Montverde, Florida");
  await page.getByRole("button", { name: "Retry With Follow-ups" }).click();

  await expect(page.getByRole("link", { name: "Open generated draft" })).toBeVisible();
});

test("unsupported fallback upload is rejected in the UI", async ({ page }) => {
  await page.goto("/recap/new");
  await page.getByTestId("audio-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not audio")
  });
  await page.getByRole("button", { name: "Upload Selected Audio" }).click();

  await expect(page.getByText("Unsupported upload type. Use webm, mp4, mp3, or wav audio.")).toBeVisible();
});