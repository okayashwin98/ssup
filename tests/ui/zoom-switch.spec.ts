import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("the zoom row's icon removes zooms from the preview and locks the zoom track", async ({
	page,
}) => {
	test.setTimeout(60000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const addZoom = page.getByRole("button", { name: "Add Zoom (Z)" });
	await expect(addZoom).toBeVisible({ timeout: 20000 });
	await addZoom.click();
	const zoomRow = page.locator('[data-timeline-row="row-zoom"]');
	await expect(
		zoomRow.locator('[data-variant="zoom"], [data-timeline-item]').first(),
	).toBeAttached();
	const canvas = page.locator("canvas").first();
	await page.waitForTimeout(1500);
	const zoomed = await canvas.screenshot();

	const zooms = page.getByRole("button", { name: "Zooms", exact: true });
	await zooms.click();
	await expect(zooms).toHaveAttribute("aria-pressed", "false");
	await expect(zoomRow.locator(":scope > div").nth(1)).toHaveAttribute("aria-disabled", "true");
	// The row's blocks fade; its icon stays clickable.
	await expect(zoomRow.locator(":scope > div").nth(1)).toHaveCSS("opacity", "0.35");
	await expect(addZoom).toBeDisabled();
	// Clicks pass through the faded track instead of reaching its zoom blocks.
	const hitsZoomTrack = await zoomRow.evaluate((row) => {
		// The blocks sit in the row's second part, after its icon column.
		const blocks = row.children[1] as HTMLElement;
		const box = blocks.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + 60, box.top + box.height / 2);
		return blocks.contains(hit);
	});
	expect(hitsZoomTrack).toBe(false);
	await page.waitForTimeout(1500);
	expect((await canvas.screenshot()).equals(zoomed)).toBe(false);

	await zooms.click();
	await expect(zoomRow.locator(":scope > div").nth(1)).not.toHaveAttribute(
		"aria-disabled",
		"true",
	);
	await page.waitForTimeout(1500);
	expect((await canvas.screenshot()).equals(zoomed)).toBe(true);
});

test("the video row's icon takes the recording out of the preview and back", async ({ page }) => {
	test.setTimeout(60000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const video = page.getByRole("button", { name: "Video", exact: true });
	await expect(video).toBeVisible({ timeout: 20000 });
	await expect(video).toHaveAttribute("aria-pressed", "true");
	const canvas = page.locator("canvas").first();
	await page.waitForTimeout(1500);
	const shown = await canvas.screenshot();
	await video.click();
	await expect(video).toHaveAttribute("aria-pressed", "false");
	await expect(page.locator('[data-timeline-row="row-clip"]')).toHaveAttribute(
		"data-layer-off",
		"",
	);
	await page.waitForTimeout(800);
	expect((await canvas.screenshot()).equals(shown)).toBe(false);
	await video.click();
	await page.waitForTimeout(800);
	expect((await canvas.screenshot()).equals(shown)).toBe(true);
});
