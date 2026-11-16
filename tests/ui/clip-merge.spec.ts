import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

test("shift-click selects a range of clips and Merge joins them back", async ({ page }) => {
	test.setTimeout(60_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	const clips = page.locator('[data-variant="clip"]');
	await expect(clips).toHaveCount(1, { timeout: 20_000 });
	const whole = {
		start: await clips.first().getAttribute("data-start-ms"),
		end: await clips.first().getAttribute("data-end-ms"),
	};
	const firstClip = await clips.first().boundingBox();
	const timeline = page
		.locator(".select-none.bg-editor-bg.relative.cursor-pointer.group.flex.flex-col")
		.last();
	const canvas = await timeline.boundingBox();
	if (!firstClip || !canvas) throw new Error("Timeline is not visible");
	for (const [index, at] of [0.3, 0.65].entries()) {
		await page.mouse.click(firstClip.x + firstClip.width * at, canvas.y + 6);
		await page.getByRole("button", { name: /Split Clip/ }).click();
		await expect(clips).toHaveCount(index + 2);
	}
	const selected = page.locator('[data-variant="clip"] [class*="selected"]');
	const merge = page.getByRole("button", { name: /^Merge \d+ clips$/ });
	const reason = page.getByText(
		"Merge requires continuous footage with matching speed and audio settings.",
	);

	// One clip selected, as before: Delete Clip is offered, Merge is not.
	await clips.nth(0).click();
	await expect(page.getByRole("button", { name: "Delete Clip" })).toBeVisible();
	await expect(merge).toHaveCount(0);
	await expect(selected).toHaveCount(1);

	// Shift-click takes every clip up to the clicked one; a plain click goes back to one.
	await clips.nth(2).click({ modifiers: ["Shift"] });
	await expect(merge).toHaveAccessibleName("Merge 3 clips");
	await clips.nth(1).click();
	await expect(merge).toHaveCount(0);
	await expect(selected).toHaveCount(1);
	await clips.nth(0).click();
	await clips.nth(1).click({ modifiers: ["Shift"] });
	await expect(merge).toHaveAccessibleName("Merge 2 clips");
	await clips.nth(2).click({ modifiers: ["Shift"] });
	await expect(merge).toHaveAccessibleName("Merge 3 clips");
	await expect(merge).toBeEnabled();
	await expect(selected).toHaveCount(3);
	await expect(reason).toHaveCount(0);
	for (const dark of [false, true]) {
		await page.evaluate((on) => document.documentElement.classList.toggle("dark", on), dark);
		await page.screenshot({
			path: `test-results/clip-merge-ready-${dark ? "dark" : "light"}.png`,
			animations: "disabled",
		});
		await page.screenshot({
			path: `test-results/clip-merge-ready-timeline-${dark ? "dark" : "light"}.png`,
			animations: "disabled",
			clip: { x: 0, y: 790, width: 1440, height: 110 },
		});
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));

	await merge.click();
	await expect(clips).toHaveCount(1);
	await expect(clips.first()).toHaveAttribute("data-start-ms", whole.start!);
	await expect(clips.first()).toHaveAttribute("data-end-ms", whole.end!);
	await expect(merge).toHaveCount(0);

	// One undo brings the three clips back.
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(clips).toHaveCount(3);

	// A muted clip does not match its neighbour, so Merge explains itself instead.
	await clips.nth(0).click();
	await page.getByText("Mute clip", { exact: true }).click();
	await expect(page.getByRole("switch", { name: "Mute clip" })).toBeChecked();
	await clips.nth(1).click({ modifiers: ["Shift"] });
	await expect(merge).toBeDisabled();
	await expect(reason).toBeVisible();
	for (const dark of [false, true]) {
		await page.evaluate((on) => document.documentElement.classList.toggle("dark", on), dark);
		await page.screenshot({
			path: `test-results/clip-merge-unavailable-${dark ? "dark" : "light"}.png`,
			animations: "disabled",
		});
	}
	await expect(clips).toHaveCount(3);
});
