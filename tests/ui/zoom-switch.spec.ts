import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("the Zooms switch removes zooms from the preview and locks the zoom track", async ({
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
	await expect(zoomRow.locator('[data-variant="zoom"], [data-timeline-item]').first()).toBeAttached();
	const canvas = page.locator("canvas").first();
	await page.waitForTimeout(1500);
	const zoomed = await canvas.screenshot();

	const zooms = page.getByRole("switch", { name: "Zooms" });
	await zooms.click({ force: true });
	await expect(zooms).not.toBeChecked();
	await expect(zoomRow).toHaveAttribute("aria-disabled", "true");
	await expect(zoomRow).toHaveCSS("opacity", "0.35");
	await expect(addZoom).toBeDisabled();
	// Clicks pass through the faded track instead of reaching its zoom blocks.
	const hitsZoomTrack = await zoomRow.evaluate((row) => {
		const box = row.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + 60, box.top + box.height / 2);
		return row.contains(hit);
	});
	expect(hitsZoomTrack).toBe(false);
	await page.waitForTimeout(1500);
	expect((await canvas.screenshot()).equals(zoomed)).toBe(false);

	await zooms.click({ force: true });
	await expect(zoomRow).not.toHaveAttribute("aria-disabled", "true");
	await page.waitForTimeout(1500);
	expect((await canvas.screenshot()).equals(zoomed)).toBe(true);
});
