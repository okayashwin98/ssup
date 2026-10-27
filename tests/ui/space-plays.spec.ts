import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("Space plays and pauses even after using a slider or switch", async ({ page }) => {
	test.setTimeout(60000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	await expect(page.getByLabel("Loading preview", { exact: true })).toHaveCount(0, {
		timeout: 20000,
	});
	const play = page.getByRole("button", { name: "Play", exact: true });
	const pause = page.getByRole("button", { name: "Pause", exact: true });
	await expect(play).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator('video[aria-hidden="true"]')
				.evaluate((video: HTMLVideoElement) => video.readyState),
		)
		.toBeGreaterThanOrEqual(2);

	const blur = page.getByRole("slider", { name: "Blur", exact: true });
	await blur.focus();
	const blurValue = await blur.inputValue();
	await page.keyboard.press("Space");
	await expect(pause).toBeVisible();
	await page.keyboard.press("Space");
	await expect(play).toBeVisible();
	await expect(blur).toHaveValue(blurValue);

	// A timeline row's on/off icon keeps focus but Space still plays.
	const video = page.getByRole("button", { name: "Video", exact: true });
	await video.focus();
	await page.keyboard.press("Space");
	await expect(pause).toBeVisible();
	await expect(video).toHaveAttribute("aria-pressed", "true");
	await page.keyboard.press("Space");
	await expect(play).toBeVisible();
});

test("seeking on the timeline keeps playing, a paused preview stays paused, and loop restarts", async ({
	page,
}) => {
	test.setTimeout(60000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	await expect(page.getByLabel("Loading preview", { exact: true })).toHaveCount(0, {
		timeout: 20000,
	});
	const play = page.getByRole("button", { name: "Play", exact: true });
	const pause = page.getByRole("button", { name: "Pause", exact: true });
	const video = page.locator('video[aria-hidden="true"]');
	await expect
		.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
		.toBeGreaterThanOrEqual(2);
	const clipRow = page.locator('[data-timeline-row="row-clip"]');
	const box = (await clipRow.boundingBox())!;
	const seekTo = async (fraction: number) =>
		page.mouse.click(box.x + 40 + (box.width - 50) * fraction, box.y - 8);

	await play.click();
	await expect(pause).toBeVisible();
	await seekTo(0.6);
	await page.waitForTimeout(500);
	await expect(pause).toBeVisible();
	expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

	await pause.click();
	await expect(play).toBeVisible();
	await seekTo(0.2);
	await page.waitForTimeout(500);
	await expect(play).toBeVisible();

	// Loop: playing past the end starts again from the beginning.
	const loop = page.getByRole("button", { name: "Loop playback", exact: true });
	await loop.click();
	await expect(loop).toHaveAttribute("aria-pressed", "true");
	await seekTo(0.97);
	await play.click();
	await expect
		.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10000 })
		.toBeLessThan(0.5);
	await expect(pause).toBeVisible();
});
