import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("advanced controls preserve values and remember each section's view", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const advanced = page.getByRole("switch", { name: "Advanced settings" });
	await expect(advanced).toBeVisible({ timeout: 20000 });
	await expect(page.getByRole("switch", { name: "Link padding sides" })).toHaveCount(0);
	const blur = page.getByRole("slider", { name: "Blur", exact: true });
	await blur.focus();
	await page.keyboard.press("ArrowRight");
	const value = await blur.inputValue();
	await page.locator("aside").getByText("Advanced", { exact: true }).click();
	await expect(page.getByRole("switch", { name: "Link padding sides" })).toBeVisible();
	await page.getByRole("radio", { name: "Webcam", exact: true }).click();
	await expect(advanced).not.toBeChecked();
	await expect(page.getByRole("slider", { name: "Webcam Height" })).toHaveCount(0);
	await page.locator("aside").getByText("Advanced", { exact: true }).click();
	await expect(page.getByRole("slider", { name: "Webcam Height" })).toBeAttached();
	await page.screenshot({
		path: "test-results/editor-webcam-advanced.png",
		animations: "disabled",
	});
	await page.getByRole("radio", { name: "Scene", exact: true }).click();
	await expect(advanced).toBeChecked();
	await expect(blur).toHaveValue(value);
	await page.locator("aside").getByText("Advanced", { exact: true }).click();
	await expect(blur).toHaveValue(value);
	await page.getByRole("row", { name: "Color", exact: true }).click();
	await page.getByRole("button", { name: "Custom color", exact: true }).click();
	await page.getByRole("textbox", { name: "Hex color", exact: true }).fill("#27AE60");
	await page.keyboard.press("Tab");
	await expect(page.getByRole("textbox", { name: "Hex color", exact: true })).toHaveValue(
		"#27AE60",
	);
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Custom color", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Hex color", exact: true })).toHaveValue(
		"#27AE60",
	);
	await page.screenshot({ path: "test-results/editor-color-picker.png", animations: "disabled" });
});

test("header breadcrumb fits long names, native chrome and compact windows", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Rename project" })).toBeVisible({
		timeout: 20000,
	});
	await page.getByRole("button", { name: "Rename project" }).click();
	await page
		.getByRole("textbox", { name: "Project name" })
		.fill("A very long project title that should truncate and never cover the toolbar");
	// Validate the editing state as well as the display state.
	for (const width of [1440, 1280, 800]) {
		await page.setViewportSize({ width, height: 800 });
		for (const trafficLightsVisible of [true, false]) {
			await page.evaluate(
				(visible) =>
					window.dispatchEvent(
						new CustomEvent("test-window-chrome", {
							detail: { trafficLightsVisible: visible },
						}),
					),
				trafficLightsVisible,
			);
			await expect(page.locator(".editor-header-start")).toHaveCSS(
				"padding-left",
				trafficLightsVisible ? "76px" : "0px",
			);
			const header = await page.locator(".editor-header").boundingBox();
			const dividers = await page.locator(".editor-header").getByRole("separator").all();
			expect(dividers).toHaveLength(2);
			for (const divider of dividers) {
				const box = await divider.boundingBox();
				expect(box!.height).toBe(20);
				expect(
					Math.abs(box!.y + box!.height / 2 - (header!.y + header!.height / 2)),
				).toBeLessThanOrEqual(1);
			}
			const stage = await page.locator(".editor-preview-stage").boundingBox();
			const frame = await page.locator(".editor-preview-frame").boundingBox();
			expect(
				Math.abs(stage!.x + stage!.width / 2 - frame!.x - frame!.width / 2),
			).toBeLessThan(1);
			expect(
				Math.abs(stage!.y + stage!.height / 2 - frame!.y - frame!.height / 2),
			).toBeLessThan(1);
			const boxes = await Promise.all(
				[".editor-header-start", ".editor-header-title", ".editor-header-end"].map(
					(selector) => page.locator(selector).boundingBox(),
				),
			);
			const [left, center, right] = boxes;
			expect(center!.x).toBeGreaterThan(left!.x);
			expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x);
			expect(center!.x + center!.width).toBeLessThanOrEqual(right!.x);
			const buttons = await page.locator(".editor-playback button").evaluateAll((nodes) =>
				nodes
					.filter((n) => n.getBoundingClientRect().width > 0)
					.map((n) => {
						const r = n.getBoundingClientRect();
						return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
					}),
			);
			for (let i = 0; i < buttons.length; i++)
				for (let j = i + 1; j < buttons.length; j++) {
					const a = buttons[i],
						b = buttons[j];
					expect(
						a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
					).toBe(true);
				}
			await expect(
				page.getByRole("button", { name: "Export", exact: true }),
			).toBeInViewport();
			await expect(page.getByRole("button", { name: "Play", exact: true })).toBeInViewport();
		}
		await page.screenshot({
			path: `test-results/editor-layout-${width}.png`,
			animations: "disabled",
		});
	}
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Rename project" })).toBeVisible();
});

test("header name edits in place as a rounded field and saves on blur", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.saveProjectFileNamed = async (_data, name) => ({
			success: true,
			path: `/projects/${name}.recordly`,
		});
	});
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Rename project" })).toContainText(
		"Untitled Project",
	);
	await page.getByRole("button", { name: "Rename project" }).click();
	const input = page.getByRole("textbox", { name: "Project name" });
	// A soft fill, the app's field corner and an accent ring, with no hard border.
	await expect(input).toHaveCSS("border-top-width", "0px");
	await expect(input).toHaveCSS("border-top-left-radius", "12px");
	await expect(input).toHaveCSS("box-shadow", /2px/);
	expect(await input.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
		"rgba(0, 0, 0, 0)",
	);
	await input.fill("Launch demo");
	await input.press("Tab");
	await expect(page.getByRole("button", { name: "Rename project" })).toContainText("Launch demo");
	await page.getByRole("button", { name: "Rename project" }).click();
	await input.fill("Discard this");
	await input.press("Escape");
	await expect(page.getByRole("button", { name: "Rename project" })).toContainText("Launch demo");
});

test("new zoom blocks default to 1.8x", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Add Zoom (Z)", exact: true }).click();
	await page.locator('[data-variant="zoom"] .timeline-block').first().click();
	await expect(page.getByRole("row", { name: "1.8×", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
});

test("playback bar stays on one row, compacting only when the preview is too narrow", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible({
		timeout: 20000,
	});
	for (const width of [1440, 1150, 1000, 953, 952, 800]) {
		await page.setViewportSize({ width, height: 800 });
		const bar = (await page.locator(".editor-playback").boundingBox())!;
		const compact = bar.width <= 560;
		const buttons = await page.locator(".editor-playback button").evaluateAll((nodes) =>
			nodes.map((n) => {
				const r = n.getBoundingClientRect();
				return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height };
			}),
		);
		expect(buttons).toHaveLength(9);
		for (const [i, button] of buttons.entries()) {
			expect(button.x).toBeGreaterThanOrEqual(bar.x);
			expect(button.right).toBeLessThanOrEqual(bar.x + bar.width);
			expect(
				Math.abs((button.y + button.bottom) / 2 - (buttons[0].y + buttons[0].bottom) / 2),
			).toBeLessThan(1);
			if (i > 0) expect(button.x).toBeGreaterThanOrEqual(buttons[i - 1].right);
			// The play button is 36px at full size; every other button is 32px.
			expect(button.height).toBe(compact ? 28 : i === 5 ? 36 : 32);
		}
		const addLayer = page.getByRole("button", { name: "Add Layer", exact: true });
		await expect(addLayer.getByText("Add Layer")).toBeVisible({ visible: !compact });
		await expect(addLayer).toHaveAttribute("aria-label", "Add Layer");
	}
});
