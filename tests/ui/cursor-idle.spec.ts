import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { changedFraction, screenshotDataUrl } from "./pixels";

// Moves, rests for over three seconds, clicks without moving, then moves again.
const cursorTelemetry = [
	{ timeMs: 0, cx: 0.3, cy: 0.5 },
	{ timeMs: 800, cx: 0.5, cy: 0.5 },
	{ timeMs: 4000, cx: 0.5, cy: 0.5 },
	{ timeMs: 4000, cx: 0.5, cy: 0.5, interactionType: "click" },
	{ timeMs: 4600, cx: 0.5, cy: 0.5 },
	{ timeMs: 5000, cx: 0.7, cy: 0.5 },
];
const MOVING = 0.5;
const RESTING = 3;
const AFTER_CLICK = 4.4;
const paths = ["preview", "legacy", "modern"] as const;
type Frames = Record<(typeof paths)[number], Record<number, string>>;

async function capture(page: Page, config: Record<string, unknown>, style: string) {
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(
			JSON.stringify({
				cursorStyle: style,
				cursorTelemetry,
				cursorClickBounce: 0,
				...config,
			}),
		)}`,
	);
	await page.reload();
	const main = page.locator("main");
	await expect(main).toHaveAttribute("data-ready", "true");
	const video = page.locator("[data-preview] video").first();
	const frames: Frames = { preview: {}, legacy: {}, modern: {} };
	for (const seconds of [MOVING, RESTING, AFTER_CLICK]) {
		// The transport is created a moment after the preview reports ready, so ask until it lands.
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
			frames[kind][seconds] = await page.evaluate(
				([renderer, time]) => window.parity.exportFrame(renderer, time),
				[kind, seconds] as const,
			);
		}
	}
	return frames;
}

declare global {
	interface Window {
		parity: {
			seek(seconds: number): void;
			play(): void;
			pause(): void;
			exportFrame(kind: "legacy" | "modern", seconds: number): Promise<string>;
		};
	}
}

for (const style of ["tahoe", "snap"]) {
	test(`${style} cursor hides when idle the same way in the preview and both export renderers`, async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await installDesktopBridge(page, "filmstrip.mp4");
		const noCursor = await capture(page, { showCursor: false }, style);
		const alwaysVisible = await capture(page, { showCursor: true }, style);
		const hidesWhenIdle = await capture(
			page,
			{ showCursor: true, cursorIdleHide: true },
			style,
		);
		for (const path of paths) {
			const visible = (frames: Frames, seconds: number) =>
				changedFraction(page, frames[path][seconds], noCursor[path][seconds]);
			// Without the setting (every project saved before it) the cursor never hides.
			for (const seconds of [MOVING, RESTING, AFTER_CLICK]) {
				expect(
					await visible(alwaysVisible, seconds),
					`${path} off ${seconds}`,
				).toBeGreaterThan(0.0002);
			}
			expect(await visible(hidesWhenIdle, MOVING), `${path} moving`).toBeGreaterThan(0.0002);
			expect(await visible(hidesWhenIdle, RESTING), `${path} resting`).toBe(0);
			expect(await visible(hidesWhenIdle, AFTER_CLICK), `${path} click`).toBeGreaterThan(
				0.0002,
			);
			// While it is showing, the cursor looks the same as with the setting off.
			expect(
				await changedFraction(
					page,
					hidesWhenIdle[path][MOVING],
					alwaysVisible[path][MOVING],
				),
				`${path} moving match`,
			).toBe(0);
		}
		expect(errors).toEqual([]);
	});
}

for (const colorScheme of ["light", "dark"] as const) {
	test(`a new recording starts with Hide when idle on (${colorScheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		// Preferences saved by a version that did not have the setting yet.
		await installDesktopBridgeOverrides(page, () => {
			window.electronAPI.getAppSetting = (key) =>
				key === "recordly.editor.preferences"
					? { cursorSize: 2 }
					: key === "recordly.onboarding.v1.seen"
						? true
						: null;
		});
		await page.goto("/?windowType=editor");
		await page.getByRole("radio", { name: "Cursor", exact: true }).click();
		const toggle = page.getByRole("switch", { name: "Hide when idle" });
		await expect(toggle).toBeChecked();
		await page.screenshot({
			path: `test-results/cursor-hide-when-idle-${colorScheme}.png`,
			animations: "disabled",
		});
		await page.getByText("Hide when idle", { exact: true }).click();
		await expect(toggle).not.toBeChecked();
	});
}

test("a project saved before the setting opens with Hide when idle off", async ({ page }) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.loadCurrentProjectFile = async () => ({
			success: true,
			path: "/older.recordly",
			project: {
				version: 2,
				videoPath: `${location.origin}/tests/ui/fixtures/preview.mp4`,
				editor: { showCursor: true, cursorSize: 3 },
			},
		});
	});
	await page.goto("/?windowType=editor");
	await page.getByRole("radio", { name: "Cursor", exact: true }).click();
	await expect(page.getByRole("switch", { name: "Hide when idle" })).not.toBeChecked();
});
