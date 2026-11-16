import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { changedFraction, screenshotDataUrl } from "./pixels";

// Moves, clicks without moving, rests, then moves again (pause under the idle threshold).
const clickTelemetry = [
	{ timeMs: 0, cx: 0.3, cy: 0.5 },
	{ timeMs: 800, cx: 0.5, cy: 0.5 },
	{ timeMs: 1500, cx: 0.5, cy: 0.5 },
	{ timeMs: 1500, cx: 0.5, cy: 0.5, interactionType: "click" },
	{ timeMs: 2400, cx: 0.5, cy: 0.5 },
	{ timeMs: 3000, cx: 0.7, cy: 0.5 },
];
const OPEN = 1.3;
const CURLED = 1.55;
const times = [OPEN, CURLED];
const paths = ["preview", "legacy", "modern"] as const;
type Frames = Record<(typeof paths)[number], Record<number, string>>;
// Around the cursor at (0.5, 0.5) of the video inside the 20px padding.
const cursorRegion = { x: 0.44, y: 0.42, width: 0.14, height: 0.2 };

declare global {
	interface Window {
		parity: {
			seek(seconds: number): void;
			exportFrame(
				kind: "legacy" | "modern",
				seconds: number,
				width?: number,
			): Promise<string>;
		};
	}
}

async function capture(page: Page, config: Record<string, unknown>) {
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(
			JSON.stringify({ cursorTelemetry: clickTelemetry, cursorSize: 4, ...config }),
		)}`,
	);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
	const video = page.locator("[data-preview] video").first();
	const width = await page.locator("[data-preview]").evaluate((node) => node.clientWidth);
	const frames: Frames = { preview: {}, legacy: {}, modern: {} };
	for (const seconds of times) {
		await expect
			.poll(async () => {
				await page.evaluate((time) => window.parity.seek(time), seconds);
				return video.evaluate((node: HTMLVideoElement) => node.currentTime);
			})
			.toBeCloseTo(seconds, 1);
		await expect
			.poll(() => video.evaluate((node: HTMLVideoElement) => node.seeking))
			.toBe(false);
		await page.evaluate(
			() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
		);
		frames.preview[seconds] = await screenshotDataUrl(page.locator("[data-preview]"));
		for (const kind of ["legacy", "modern"] as const) {
			// Same size as the preview so the three can be compared pixel for pixel.
			frames[kind][seconds] = await page.evaluate(
				([renderer, time, size]) => window.parity.exportFrame(renderer, time, size),
				[kind, seconds, width] as const,
			);
		}
	}
	return frames;
}

test("Pixel Glove draws and curls on click the same way in the preview and both export renderers", async ({
	page,
}) => {
	test.setTimeout(150_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await installDesktopBridge(page, "filmstrip.mp4");
	const none = await capture(page, { showCursor: false });
	const glove = await capture(page, { showCursor: true, cursorStyle: "pixel-hand" });
	const goldenGate = await capture(page, { showCursor: true, cursorStyle: "tahoe" });
	const fadesWhenIdle = await capture(page, {
		showCursor: true,
		cursorStyle: "pixel-hand",
		cursorIdleHide: true,
	});
	const report: Record<string, number> = {};
	for (const path of paths) {
		for (const seconds of times) {
			const visible = await changedFraction(page, glove[path][seconds], none[path][seconds]);
			report[`${path} visible ${seconds}`] = visible;
			expect(visible, `${path} glove visible ${seconds}`).toBeGreaterThan(0.0005);
			// A different picture from the default cursor.
			expect(
				await changedFraction(page, glove[path][seconds], goldenGate[path][seconds]),
				`${path} differs from Golden Gate ${seconds}`,
			).toBeGreaterThan(0.0005);
			// Hide when idle leaves a short pause alone.
			expect(
				await changedFraction(page, glove[path][seconds], fadesWhenIdle[path][seconds]),
				`${path} idle-hide ${seconds}`,
			).toBe(0);
		}
		const curl = await changedFraction(
			page,
			glove[path][OPEN],
			glove[path][CURLED],
			cursorRegion,
		);
		report[`${path} curl`] = curl;
		expect(curl, `${path} curls on click`).toBeGreaterThan(0.005);
	}
	// The three paths draw the same glove in the same place.
	for (const seconds of times) {
		for (const [a, b] of [
			["preview", "legacy"],
			["preview", "modern"],
			["legacy", "modern"],
		] as const) {
			const gloveDiff = await changedFraction(
				page,
				glove[a][seconds],
				glove[b][seconds],
				cursorRegion,
			);
			const baseDiff = await changedFraction(
				page,
				none[a][seconds],
				none[b][seconds],
				cursorRegion,
			);
			report[`${a}-${b} ${seconds}`] = gloveDiff;
			report[`${a}-${b} ${seconds} base`] = baseDiff;
			expect(gloveDiff - baseDiff, `${a} vs ${b} at ${seconds}`).toBeLessThan(0.01);
		}
	}
	console.log(JSON.stringify(report));
	expect(errors).toEqual([]);
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(
			JSON.stringify({
				cursorTelemetry: clickTelemetry,
				cursorSize: 4,
				showCursor: true,
				cursorStyle: "pixel-hand",
			}),
		)}`,
	);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
	await page.evaluate((time) => window.parity.seek(time), CURLED);
	await page.waitForTimeout(500);
	await page.evaluate((time) => window.parity.exportFrame("modern", time), CURLED);
	await page.screenshot({ path: "test-results/pixel-glove-parity.png", fullPage: true });
});

for (const colorScheme of ["light", "dark"] as const) {
	test(`Pixel Glove is a choice in the cursor style picker (${colorScheme})`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(page, () => {
			window.electronAPI.getAppSetting = (key) =>
				key === "recordly.onboarding.v1.seen" ? true : null;
		});
		await page.goto("/?windowType=editor");
		await page.getByRole("radio", { name: "Cursor", exact: true }).click();
		const group = page.getByRole("grid", { name: "Cursor Style" });
		const choice = group.getByRole("row", { name: "Pixel Glove" });
		await choice.click();
		await expect(choice).toHaveAttribute("aria-selected", "true");
		await expect(group.locator("img").last()).toHaveJSProperty("complete", true);
		await page.screenshot({
			path: `test-results/pixel-glove-picker-${colorScheme}.png`,
			animations: "disabled",
		});
		await group.screenshot({
			path: `test-results/pixel-glove-picker-zoom-${colorScheme}.png`,
			animations: "disabled",
		});
	});
}
