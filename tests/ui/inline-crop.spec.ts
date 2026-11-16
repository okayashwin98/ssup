import { expect, type Locator, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Drags a crop handle (or the crop itself) by a share of the frame. */
async function drag(
	page: Page,
	from: Locator,
	surface: Locator,
	dx: number,
	dy: number,
	shift = false,
) {
	const start = await box(from);
	const frame = await box(surface);
	const x = start.x + start.width / 2;
	const y = start.y + start.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	if (shift) await page.keyboard.down("Shift");
	await page.mouse.move(x + (dx * frame.width) / 2, y + (dy * frame.height) / 2);
	await page.mouse.move(x + dx * frame.width, y + dy * frame.height);
	await page.mouse.up();
	if (shift) await page.keyboard.up("Shift");
}

test("Crop puts handles on the preview; Enter applies and Escape cancels", async ({ page }) => {
	test.setTimeout(60_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	const clips = page.locator('[data-variant="clip"]');
	await expect(clips).toHaveCount(1, { timeout: 20_000 });
	const openCrop = page.getByRole("button", { name: "Crop Video", exact: true });
	const crop = page.getByRole("dialog", { name: "Crop Video", exact: true });
	const surface = crop.getByTestId("crop-surface");
	const selection = crop.getByTestId("crop-selection");
	const handle = (name: string) => crop.locator(`[data-crop-handle="${name}"]`);
	/** The crop as shares of the frame: [left, top, width, height]. */
	const shares = async () => {
		const frame = await box(surface);
		const area = await box(selection);
		return [
			(area.x - frame.x) / frame.width,
			(area.y - frame.y) / frame.height,
			area.width / frame.width,
			area.height / frame.height,
		].map((value) => Math.round(value * 100) / 100);
	};
	const previewArea = await box(page.locator(".editor-preview-area"));

	await openCrop.click();
	await expect(crop).toBeVisible();
	await expect(crop).toBeFocused();
	// The whole frame is shown, in the preview's place, with nothing cropped yet.
	const frame = await box(surface);
	expect(frame.x).toBeGreaterThanOrEqual(previewArea.x);
	expect(frame.x + frame.width).toBeLessThanOrEqual(previewArea.x + previewArea.width);
	expect(frame.y).toBeGreaterThanOrEqual(previewArea.y);
	expect(frame.y + frame.height).toBeLessThanOrEqual(previewArea.y + previewArea.height);
	expect(await shares()).toEqual([0, 0, 1, 1]);
	// The preview's own controls step aside while cropping.
	await expect(page.locator(".editor-preview-area")).toHaveCSS("opacity", "0");
	await expect(openCrop).toBeHidden();
	await expect(page.getByRole("toolbar", { name: "Annotation tools" })).toBeHidden();

	// Edges, corners and the crop itself can be dragged.
	await drag(page, handle("e"), surface, -0.25, 0);
	expect(await shares()).toEqual([0, 0, 0.75, 1]);
	await drag(page, handle("nw"), surface, 0.1, 0.2);
	expect(await shares()).toEqual([0.1, 0.2, 0.65, 0.8]);
	await drag(page, selection, surface, 0.1, -0.1);
	expect(await shares()).toEqual([0.2, 0.1, 0.65, 0.8]);
	// Shift makes it square.
	await drag(page, handle("se"), surface, -0.2, -0.05, true);
	const square = await box(selection);
	expect(Math.abs(square.width - square.height)).toBeLessThan(2);

	// Timeline shortcuts stay out of the way: C would otherwise split the clip.
	await page.keyboard.press("c");
	await expect(clips).toHaveCount(1);

	// Escape puts the crop back as it was.
	await page.keyboard.press("Escape");
	await expect(crop).toHaveCount(0);
	await expect(openCrop).toBeVisible();
	await openCrop.click();
	expect(await shares()).toEqual([0, 0, 1, 1]);

	// A shape from the list, then a typed one.
	await crop.getByRole("button", { name: "Crop shape: Free" }).click();
	const shapes = page.getByRole("radiogroup", { name: "Crop shape" });
	await shapes.getByRole("radio", { name: "1:1" }).click();
	await expect(shapes.getByRole("radio", { name: "1:1" })).toBeChecked();
	const fitted = await box(selection);
	expect(Math.abs(fitted.width - fitted.height)).toBeLessThan(2);
	await page.getByRole("textbox", { name: "Ratio height" }).fill("0");
	await expect(page.getByRole("alert")).toContainText("between 1:20 and 20:1");
	await page.getByRole("textbox", { name: "Ratio height" }).fill("2");
	await expect(page.getByRole("alert")).toHaveCount(0);
	const tall = await box(selection);
	expect(tall.height / tall.width).toBeCloseTo(2, 1);
	await page.mouse.move(5, 500);
	for (const dark of [false, true]) {
		await page.evaluate((on) => document.documentElement.classList.toggle("dark", on), dark);
		await page.screenshot({
			path: `test-results/inline-crop-shape-${dark ? "dark" : "light"}.png`,
			animations: "disabled",
		});
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	// Escape closes the list first, not the crop.
	await page.keyboard.press("Escape");
	await expect(shapes).toHaveCount(0);
	await expect(crop).toBeVisible();

	// Reset, crop again, and apply with Enter.
	await crop.getByRole("button", { name: "Reset", exact: true }).click();
	expect(await shares()).toEqual([0, 0, 1, 1]);
	await drag(page, handle("w"), surface, 0.3, 0);
	await drag(page, handle("s"), surface, 0, -0.2);
	expect(await shares()).toEqual([0.3, 0, 0.7, 0.8]);
	for (const [width, height, name] of [
		[1440, 1000, "normal"],
		[1000, 800, "mid"],
		[800, 600, "narrow"],
	] as const) {
		await page.setViewportSize({ width, height });
		const area = await box(page.locator(".editor-preview-area"));
		const shown = await box(surface);
		const bar = await box(crop.getByRole("button", { name: "Done", exact: true }));
		// The frame and the crop bar stay inside the preview panel at every size.
		expect(shown.x).toBeGreaterThanOrEqual(area.x);
		expect(shown.x + shown.width).toBeLessThanOrEqual(area.x + area.width);
		expect(shown.y + shown.height).toBeLessThanOrEqual(area.y + area.height);
		expect(bar.x + bar.width).toBeLessThanOrEqual(area.x + area.width);
		expect(await shares()).toEqual([0.3, 0, 0.7, 0.8]);
		for (const dark of [false, true]) {
			await page.evaluate(
				(on) => document.documentElement.classList.toggle("dark", on),
				dark,
			);
			await page.screenshot({
				path: `test-results/inline-crop-${name}-${dark ? "dark" : "light"}.png`,
				animations: "disabled",
			});
		}
		await page.evaluate(() => document.documentElement.classList.remove("dark"));
	}
	await page.setViewportSize({ width: 1440, height: 1000 });
	await crop.focus();
	await page.keyboard.press("Enter");
	await expect(crop).toHaveCount(0);
	// The crop is kept, and the preview and its tools are back.
	await expect(page.getByRole("toolbar", { name: "Annotation tools" })).toBeVisible();
	await expect(page.locator(".editor-preview-frame")).toBeVisible();
	await page.screenshot({
		path: "test-results/inline-crop-applied-light.png",
		animations: "disabled",
	});
	await openCrop.click();
	expect(await shares()).toEqual([0.3, 0, 0.7, 0.8]);
	await crop.getByRole("button", { name: "Done", exact: true }).click();
	await expect(crop).toHaveCount(0);
});
