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

	const zooms = page.getByRole("switch", { name: "Zooms" });
	await zooms.focus();
	await page.keyboard.press("Space");
	await expect(pause).toBeVisible();
	await expect(zooms).toBeChecked();
	await page.keyboard.press("Space");
	await expect(play).toBeVisible();
});
