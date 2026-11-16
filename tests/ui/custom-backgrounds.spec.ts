import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { changedFraction } from "./pixels";

declare global {
	interface Window {
		parity: {
			seek(seconds: number): void;
			exportFrame(
				kind: "legacy" | "modern",
				seconds: number,
				width?: number,
			): Promise<string>;
			breezeGradient(width?: number): string;
		};
	}
}

const TIME = 1.2;
// The strip above the video is all background at this padding.
const TOP_STRIP = { x: 0, y: 0, width: 1, height: 0.03 };

async function frames(page: Page, wallpaper: string) {
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(JSON.stringify({ wallpaper }))}`,
	);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
	const video = page.locator("[data-preview] video").first();
	await expect
		.poll(async () => {
			await page.evaluate((time) => window.parity.seek(time), TIME);
			return video.evaluate((node: HTMLVideoElement) => node.currentTime);
		})
		.toBeCloseTo(TIME, 1);
	await page.evaluate(
		() =>
			new Promise((done) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150))),
			),
	);
	const box = await page.locator("[data-preview]").boundingBox();
	if (!box) throw new Error("No preview");
	const width = Math.round(box.width);
	const clip = { x: box.x, y: box.y, width, height: Math.round((width * 9) / 16) };
	const shot = await page.screenshot({ clip, animations: "disabled" });
	const result = {
		preview: `data:image/png;base64,${shot.toString("base64")}`,
		legacy: "",
		modern: "",
		breeze: await page.evaluate((size) => window.parity.breezeGradient(size), width),
	};
	for (const kind of ["legacy", "modern"] as const) {
		result[kind] = await page.evaluate(
			([renderer, time, size]) => window.parity.exportFrame(renderer, time, size),
			[kind, TIME, width] as const,
		);
	}
	return result;
}

test("custom gradients look the same in the preview, both export renderers and Breeze", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	for (const wallpaper of [
		"linear-gradient(135deg, #635bff 0%, #22d3ee 100%)",
		"linear-gradient(30deg, #f43f5e 0%, #fde047 50%, #0ea5e9 100%)",
		"linear-gradient(270deg, #111827 0%, #a855f7 25%, #f97316 50%, #22c55e 75%, #ffffff 100%)",
	]) {
		const shots = await frames(page, wallpaper);
		const report: Record<string, number> = {};
		for (const [a, b] of [
			["preview", "legacy"],
			["preview", "modern"],
			["legacy", "modern"],
		] as const) {
			report[`${a}-${b}`] = await changedFraction(page, shots[a], shots[b]);
			expect(report[`${a}-${b}`], `${wallpaper} ${a} vs ${b}`).toBeLessThan(0.002);
		}
		for (const path of ["preview", "modern"] as const) {
			report[`breeze-${path} background`] = await changedFraction(
				page,
				shots.breeze,
				shots[path],
				TOP_STRIP,
			);
			expect(report[`breeze-${path} background`], `${wallpaper} Breeze`).toBeLessThan(0.002);
		}
		console.log(wallpaper, JSON.stringify(report));
	}
	// The test can tell: a preset with an angle still exports the older straight-down way.
	const preset = await frames(page, "linear-gradient(90deg, #FF0101, #4DFF01)");
	expect(await changedFraction(page, preset.preview, preset.modern)).toBeGreaterThan(0.05);
});

async function openBackground(page: Page, scheme: "light" | "dark") {
	await page.emulateMedia({ colorScheme: scheme });
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Add wallpaper", exact: true })).toBeVisible({
		timeout: 20000,
	});
}

test("custom gradients are built, saved for every project and removed", async ({ page }) => {
	test.setTimeout(90_000);
	await installDesktopBridge(page);
	await openBackground(page, "light");
	await page.getByRole("row", { name: "Gradient", exact: true }).click();
	await page.getByRole("button", { name: "Create custom gradient", exact: true }).click();
	await page.getByRole("button", { name: "Add color", exact: true }).click();
	await expect(page.getByRole("button", { name: "Color 3", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Remove color 3", exact: true }).click();
	await expect(page.getByRole("button", { name: "Color 3", exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Save gradient", exact: true }).click();
	const custom = page.getByRole("button", { name: "Custom gradient 1", exact: true });
	await expect(custom).toHaveAttribute("aria-pressed", "true");
	await expect(custom.locator("div")).toHaveAttribute(
		"style",
		/linear-gradient\(135deg, (rgb\(99, 91, 255\)|#635bff) 0%, (rgb\(34, 211, 238\)|#22d3ee) 100%\)/,
	);
	for (const scheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await custom.hover();
		await page
			.locator("aside")
			.first()
			.screenshot({ path: `test-results/custom-gradient-saved-${scheme}.png` });
	}
	// Saved gradients come back in a new session.
	await page.reload();
	await page.getByRole("row", { name: "Gradient", exact: true }).click({ timeout: 20000 });
	await expect(custom).toBeVisible();
	await custom.hover();
	await page.getByRole("button", { name: "Remove Custom gradient 1", exact: true }).click();
	await expect(custom).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Gradient 1", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	for (const scheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.getByRole("button", { name: "Create custom gradient", exact: true }).click();
		await page.getByRole("button", { name: "Add color", exact: true }).click();
		await page
			.locator("aside")
			.first()
			.screenshot({ path: `test-results/custom-gradient-builder-${scheme}.png` });
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
	}
});

test("custom colors are saved for every project and removed", async ({ page }) => {
	test.setTimeout(90_000);
	await installDesktopBridge(page);
	await openBackground(page, "light");
	await page.getByRole("row", { name: "Color", exact: true }).click();
	await page.getByRole("button", { name: "Custom color", exact: true }).click();
	const hex = page.getByRole("textbox", { name: "Hex color" });
	await hex.fill("#12AB34");
	await hex.press("Enter");
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Save color", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Remove custom color", exact: true }),
	).toBeVisible();
	const swatches = page.locator('aside [aria-label="Colors"] [role="option"]');
	await expect(swatches).toHaveCount(16);
	for (const scheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page
			.locator("aside")
			.first()
			.screenshot({ path: `test-results/custom-color-saved-${scheme}.png` });
	}
	await page.reload();
	await page.getByRole("row", { name: "Color", exact: true }).click({ timeout: 20000 });
	await expect(swatches).toHaveCount(16);
	await swatches.last().click();
	await page.getByRole("button", { name: "Remove custom color", exact: true }).click();
	await expect(swatches).toHaveCount(15);
	await expect(page.getByRole("button", { name: "Save color", exact: true })).toBeVisible();
});
