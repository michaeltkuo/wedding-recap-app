import { expect, test } from "@playwright/test";

const validAudio = {
  name: "recap.webm",
  mimeType: "audio/webm",
  buffer: Buffer.alloc(1024, 1)
};

test("contractor flow handles pipeline and reports explicit provider failures", async ({ page }) => {
  await page.goto("/recap/new");

  await expect(page.getByRole("button", { name: "Record recap" })).toBeVisible();
  await expect(page.getByText("michael@authormadephoto.com")).toBeVisible();

  await page.getByTestId("audio-input").setInputFiles(validAudio);

  const reviewReadyHeading = page.getByRole("heading", { name: "The story is taking shape." });
  const errorHeading = page.getByRole("heading", { name: "This recap did not finish." }).first();

  await expect(reviewReadyHeading.or(errorHeading).first()).toBeVisible({ timeout: 30000 });
  const onReviewStage = await reviewReadyHeading.isVisible();

  if (onReviewStage) {
    await page.getByRole("button", { name: "Send recap" }).click();
    await expect(page.getByRole("heading", { name: "This recap did not finish." }).first()).toBeVisible();
    await expect(page.getByText("connect Google OAuth first").first()).toBeVisible();
  } else {
    await expect(errorHeading).toBeVisible();
    await expect(page.locator(".error-content p").nth(1)).toBeVisible();
  }

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your recent tapes" })).toBeVisible();
  await expect(page.getByText("Alex + Sam", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs retry", { exact: true })).toBeVisible();
});

test("unsupported imported audio shows a recovery state", async ({ page }) => {
  await page.goto("/recap/new");

  await page.getByTestId("audio-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not audio")
  });

  await expect(page.getByRole("heading", { name: "This recap did not finish." }).first()).toBeVisible();
  await expect(page.locator(".error-content").getByText("Use a webm, m4a, mp3, or wav audio file.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new recap" }).first()).toBeVisible();
});

test("mobile capture view stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/recap/new");

  await expect(page.getByRole("button", { name: "Record recap" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Application" })).toBeVisible();
  await expect(page.getByText("Delivered to Michael's editorial desk.")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
