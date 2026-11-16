import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { changedFraction } from "./pixels";

const paths = ["preview", "legacy", "modern"] as const;
type Path = (typeof paths)[number];
type Frames = Record<Path, string>;
const TIME = 1.2;

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

async function open(page: Page, webcam: Record<string, unknown>) {
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(
			JSON.stringify({
				webcamVideo: "/tests/ui/fixtures/filmstrip.mp4",
				webcam: { size: 40, width: 40, height: 40, shadow: 0.6, ...webcam },
			}),
		)}`,
	);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
}

async function seekPreview(page: Page, seconds: number) {
	const video = page.locator("[data-preview] video").first();
	const webcam = page.locator("[data-webcam-overlay] video");
	await expect
		.poll(async () => {
			await page.evaluate((time) => window.parity.seek(time), seconds);
			return video.evaluate((node: HTMLVideoElement) => node.currentTime);
		})
		.toBeCloseTo(seconds, 1);
	for (const media of [video, webcam]) {
		await expect
			.poll(() =>
				media.evaluate((node: HTMLVideoElement) => !node.seeking && node.readyState >= 2),
			)
			.toBe(true);
	}
	await page.evaluate(
		() =>
			new Promise((done) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150))),
			),
	);
}

async function capture(page: Page, webcam: Record<string, unknown>): Promise<Frames> {
	await open(page, webcam);
	await seekPreview(page, TIME);
	const box = await page.locator("[data-preview]").boundingBox();
	if (!box) throw new Error("No preview");
	const width = Math.round(box.width);
	// The export renderers make a 16:9 frame of the same width.
	const clip = { x: box.x, y: box.y, width, height: Math.round((width * 9) / 16) };
	const shot = await page.screenshot({ clip, animations: "disabled" });
	const frames = { preview: `data:image/png;base64,${shot.toString("base64")}` } as Frames;
	for (const kind of ["legacy", "modern"] as const) {
		frames[kind] = await page.evaluate(
			([renderer, time, size]) => window.parity.exportFrame(renderer, time, size),
			[kind, TIME, width] as const,
		);
	}
	return frames;
}

async function expectParity(page: Page, soft: Frames, sharp: Frames, label: string) {
	const report: Record<string, number> = {};
	for (const path of paths) {
		const edge = await changedFraction(page, soft[path], sharp[path]);
		report[`${path} soft-vs-standard`] = edge;
		expect(edge, `${label} ${path} soft edges change the picture`).toBeGreaterThan(0.0005);
	}
	for (const [a, b] of [
		["preview", "legacy"],
		["preview", "modern"],
		["legacy", "modern"],
	] as const) {
		const softDiff = await changedFraction(page, soft[a], soft[b]);
		const sharpDiff = await changedFraction(page, sharp[a], sharp[b]);
		report[`${a}-${b} soft`] = softDiff;
		report[`${a}-${b} standard`] = sharpDiff;
		// Soft edges add no difference between paths beyond what the standard edge already has.
		expect(softDiff - sharpDiff, `${label} ${a} vs ${b}`).toBeLessThan(0.002);
	}
	console.log(label, JSON.stringify(report));
}

test("soft webcam edges match in the preview and both export renderers", async ({ page }) => {
	test.setTimeout(240_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await installDesktopBridge(page, "filmstrip.mp4");
	const older = await capture(page, {});
	const standard = await capture(page, { previewFrame: "standard" });
	const soft = await capture(page, { previewFrame: "soft-blur" });
	// A project without the setting looks like Standard, in every path (within the frame-to-frame
	// noise the older renderer already has between two identical renders).
	const repeat = await capture(page, { previewFrame: "standard" });
	for (const path of paths) {
		const olderDiff = await changedFraction(page, older[path], standard[path]);
		const noise = await changedFraction(page, repeat[path], standard[path]);
		console.log(`${path} older-vs-standard ${olderDiff} repeat-noise ${noise}`);
		expect(olderDiff, path).toBeLessThanOrEqual(Math.max(noise, 0) + 0.0005);
	}
	await expectParity(page, soft, standard, "bottom-right round");
	await page.screenshot({ path: "test-results/webcam-soft-edges-parity.png", fullPage: true });
	await open(page, { previewFrame: "standard" });
	await seekPreview(page, TIME);
	await page
		.locator("[data-preview]")
		.screenshot({ path: "test-results/webcam-standard-edges.png" });
	await open(page, { previewFrame: "soft-blur" });
	await seekPreview(page, TIME);
	await page.locator("[data-preview]").screenshot({ path: "test-results/webcam-soft-edges.png" });
	expect(errors).toEqual([]);
});

for (const [positionPreset, roundness] of [
	["top-left", 0],
	["center", 50],
	["bottom-center", 100],
] as const) {
	test(`soft webcam edges match at ${positionPreset}, roundness ${roundness}`, async ({
		page,
	}) => {
		test.setTimeout(240_000);
		await installDesktopBridge(page, "filmstrip.mp4");
		const settings = {
			positionPreset,
			corner: "bottom-right",
			positionX: positionPreset === "top-left" ? 0 : 0.5,
			positionY: positionPreset === "top-left" ? 0 : positionPreset === "center" ? 0.5 : 1,
			roundness,
		};
		const standard = await capture(page, { ...settings, previewFrame: "standard" });
		const soft = await capture(page, { ...settings, previewFrame: "soft-blur" });
		await expectParity(page, soft, standard, `${positionPreset} ${roundness}`);
	});
}

test("soft webcam edges stay on while scrubbing instead of flashing a sharp frame", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await open(page, { previewFrame: "soft-blur" });
	await seekPreview(page, 0.5);
	const softCanvas = page.locator("[data-webcam-soft-edges]");
	await expect(softCanvas).toBeVisible();
	// Sample the layers as fast as possible while seeking back and forth.
	const samples = await page.evaluate(async () => {
		const canvas = document.querySelector<HTMLCanvasElement>("[data-webcam-soft-edges]");
		const inner = canvas?.previousElementSibling as HTMLElement | null;
		const seen: string[] = [];
		const record = () =>
			seen.push(
				`${canvas?.style.display}/${inner ? getComputedStyle(inner).visibility : "?"}`,
			);
		for (const time of [2.4, 0.8, 3.1, 1.6, 2.9, 0.3]) {
			window.parity.seek(time);
			for (let frame = 0; frame < 6; frame += 1) {
				record();
				await new Promise((done) => requestAnimationFrame(done));
			}
		}
		return seen;
	});
	expect(new Set(samples)).toEqual(new Set(["block/hidden"]));
});

for (const colorScheme of ["light", "dark"] as const) {
	test(`a new recording starts with soft webcam edges (${colorScheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		// Preferences saved by a version that did not have the setting yet.
		await installDesktopBridgeOverrides(page, () => {
			window.electronAPI.getAppSetting = (key) =>
				key === "recordly.editor.preferences"
					? { webcam: { enabled: true, roundness: 60 } }
					: key === "recordly.onboarding.v1.seen"
						? true
						: null;
		});
		await page.goto("/?windowType=editor");
		await page.getByRole("radio", { name: "Webcam", exact: true }).click();
		const toggle = page.getByRole("switch", { name: "Soft edges" });
		await expect(toggle).toBeChecked();
		await page.screenshot({
			path: `test-results/webcam-soft-edges-${colorScheme}.png`,
			animations: "disabled",
		});
		await page
			.locator('[data-slot="switch"]')
			.filter({ has: toggle })
			.locator('[data-slot="switch-control"]')
			.click();
		await expect(toggle).not.toBeChecked();
	});
}

test("a project saved before the setting opens with soft edges off", async ({ page }) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.loadCurrentProjectFile = async () => ({
			success: true,
			path: "/older.recordly",
			project: {
				version: 2,
				videoPath: `${location.origin}/tests/ui/fixtures/preview.mp4`,
				editor: { webcam: { enabled: true, roundness: 60 } },
			},
		});
	});
	await page.goto("/?windowType=editor");
	await page.getByRole("radio", { name: "Webcam", exact: true }).click();
	await expect(page.getByRole("switch", { name: "Soft edges" })).not.toBeChecked();
});
