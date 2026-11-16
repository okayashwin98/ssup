import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { changedFraction } from "./pixels";

const paths = ["preview", "legacy", "modern"] as const;
type Frames = Record<(typeof paths)[number], string>;
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

async function capture(page: Page, webcam: Record<string, unknown>, shotPath?: string) {
	await page.goto(
		`/tests/ui/render-parity.html#${encodeURIComponent(
			JSON.stringify({
				webcamVideo: "/tests/ui/fixtures/filmstrip.mp4",
				webcam: { size: 40, width: 40, height: 40, shadow: 0.6, roundness: 60, ...webcam },
			}),
		)}`,
	);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
	const video = page.locator("[data-preview] video").first();
	const camera = page.locator("[data-webcam-overlay] video");
	await expect
		.poll(async () => {
			await page.evaluate((time) => window.parity.seek(time), TIME);
			return video.evaluate((node: HTMLVideoElement) => node.currentTime);
		})
		.toBeCloseTo(TIME, 1);
	for (const media of [video, camera]) {
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
	const box = await page.locator("[data-preview]").boundingBox();
	if (!box) throw new Error("No preview");
	const width = Math.round(box.width);
	const clip = { x: box.x, y: box.y, width, height: Math.round((width * 9) / 16) };
	if (shotPath) await page.screenshot({ clip, path: shotPath });
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

test("webcam shapes draw the same in the preview and both export renderers", async ({ page }) => {
	test.setTimeout(300_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await installDesktopBridge(page, "filmstrip.mp4");
	const report: Record<string, number> = {};
	for (const previewFrame of ["standard", "soft-blur"] as const) {
		const older = await capture(page, { previewFrame });
		const squircle = await capture(page, { previewFrame, shape: "squircle" });
		// No shape (every project saved before the choice) is today's squircle, exactly.
		for (const path of paths) {
			expect(
				await changedFraction(page, older[path], squircle[path]),
				`${previewFrame} ${path}`,
			).toBe(0);
		}
		for (const shape of ["circle", "rectangle"] as const) {
			const frames = await capture(
				page,
				{
					previewFrame,
					shape,
					...(shape === "rectangle" ? { height: 22.5, roundness: 30 } : {}),
				},
				`test-results/webcam-shape-${shape}-${previewFrame}.png`,
			);
			for (const path of paths) {
				const change = await changedFraction(page, frames[path], squircle[path]);
				report[`${previewFrame} ${shape} ${path} vs squircle`] = change;
				expect(
					change,
					`${previewFrame} ${shape} ${path} changes the shape`,
				).toBeGreaterThan(0.002);
			}
			for (const [a, b] of [
				["preview", "legacy"],
				["preview", "modern"],
				["legacy", "modern"],
			] as const) {
				const shapeDiff = await changedFraction(page, frames[a], frames[b]);
				const baseDiff = await changedFraction(page, squircle[a], squircle[b]);
				report[`${previewFrame} ${shape} ${a}-${b}`] = shapeDiff;
				report[`${previewFrame} squircle ${a}-${b}`] = baseDiff;
				// The new shapes add no preview/export difference beyond today's squircle.
				expect(shapeDiff - baseDiff, `${previewFrame} ${shape} ${a} vs ${b}`).toBeLessThan(
					0.003,
				);
			}
		}
	}
	console.log(JSON.stringify(report));
	expect(errors).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
	test(`webcam shape choice; Circle hides roundness (${colorScheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(page, () => {
			window.electronAPI.getAppSetting = (key) =>
				key === "recordly.onboarding.v1.seen" ? true : null;
		});
		await page.goto("/?windowType=editor");
		await page.getByRole("radio", { name: "Webcam", exact: true }).click();
		const shapes = page.getByRole("grid", { name: "Shape" });
		const roundness = page.getByText("Webcam Roundness");
		await expect(shapes.getByRole("row", { name: "Square" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(roundness).toBeVisible();
		await shapes.getByRole("row", { name: "Circle" }).click();
		await expect(shapes.getByRole("row", { name: "Circle" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(roundness).toHaveCount(0);
		await page.screenshot({
			path: `test-results/webcam-shape-circle-${colorScheme}.png`,
			animations: "disabled",
		});
		await shapes.getByRole("row", { name: "Rectangle" }).click();
		await expect(roundness).toBeVisible();
		await page.screenshot({
			path: `test-results/webcam-shape-rectangle-${colorScheme}.png`,
			animations: "disabled",
		});
	});
}

test("a project saved before the shape choice opens as Square with roundness", async ({ page }) => {
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
	await expect(
		page.getByRole("grid", { name: "Shape" }).getByRole("row", { name: "Square" }),
	).toHaveAttribute("aria-selected", "true");
	await expect(page.getByText("Webcam Roundness")).toBeVisible();
});
