import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { changedFraction } from "./pixels";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

const captions = [
	{
		id: "a",
		startMs: 1000,
		endMs: 3000,
		text: "Make it clear",
		words: [
			{ text: "Make", startMs: 1000, endMs: 1400 },
			{ text: "it", startMs: 1500, endMs: 1800, leadingSpace: true },
			{ text: "clear", startMs: 2000, endMs: 3000, leadingSpace: true },
		],
	},
];
// One word shown, mid-way through Reveal's fade-in of the second word, and the whole caption.
const TIMES = [1.2, 1.55, 2.5];
const paths = ["preview", "legacy", "modern"] as const;
type Frames = Record<(typeof paths)[number], string>;
// The caption sits in the lower part of the frame.
const CAPTION_REGION = { x: 0, y: 0.7, width: 1, height: 0.3 };

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

async function open(page: Page, config: Record<string, unknown>) {
	await page.goto(`/tests/ui/render-parity.html#${encodeURIComponent(JSON.stringify(config))}`);
	await page.reload();
	await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
}

async function capture(page: Page, seconds: number): Promise<Frames> {
	const video = page.locator("[data-preview] video").first();
	await expect
		.poll(async () => {
			await page.evaluate((time) => window.parity.seek(time), seconds);
			return video.evaluate((node: HTMLVideoElement) => node.currentTime);
		})
		.toBeCloseTo(seconds, 1);
	await expect
		.poll(() =>
			video.evaluate((node: HTMLVideoElement) => !node.seeking && node.readyState >= 2),
		)
		.toBe(true);
	await page.evaluate(
		() =>
			new Promise((done) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150))),
			),
	);
	// Export at exactly the time the preview shows, so Reveal's fade is at the same point.
	const shown = Number(await page.locator("main").getAttribute("data-time"));
	const box = await page.locator("[data-preview]").boundingBox();
	if (!box) throw new Error("No preview");
	const width = Math.round(box.width);
	const clip = { x: box.x, y: box.y, width, height: Math.round((width * 9) / 16) };
	const shot = await page.screenshot({ clip, animations: "disabled" });
	const frames = { preview: `data:image/png;base64,${shot.toString("base64")}` } as Frames;
	for (const kind of ["legacy", "modern"] as const) {
		frames[kind] = await page.evaluate(
			([renderer, time, size]) => window.parity.exportFrame(renderer, time, size),
			[kind, shown, width] as const,
		);
	}
	return frames;
}

for (const style of ["classic", "reveal", "tiktok"] as const) {
	test(`${style} captions look the same in the preview and both export renderers`, async ({
		page,
	}) => {
		test.setTimeout(240_000);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await installDesktopBridge(page, "filmstrip.mp4");
		const report: Record<string, number> = {};
		const plain: Record<number, Frames> = {};
		await open(page, {});
		for (const time of TIMES) plain[time] = await capture(page, time);
		await open(page, { captions, captionStyle: style });
		for (const time of TIMES) {
			const withCaptions = await capture(page, time);
			for (const path of paths) {
				writeFileSync(
					`test-results/caption-${style}-${time}s-${path}.png`,
					Buffer.from(withCaptions[path].split(",")[1], "base64"),
				);
			}
			for (const path of paths) {
				const drawn = await changedFraction(
					page,
					plain[time][path],
					withCaptions[path],
					CAPTION_REGION,
				);
				report[`${time}s ${path} caption`] = drawn;
			}
			for (const [a, b] of [
				["preview", "legacy"],
				["preview", "modern"],
				["legacy", "modern"],
			] as const) {
				const base = await changedFraction(
					page,
					plain[time][a],
					plain[time][b],
					CAPTION_REGION,
				);
				const diff = await changedFraction(
					page,
					withCaptions[a],
					withCaptions[b],
					CAPTION_REGION,
				);
				report[`${time}s ${a}-${b}`] = diff - base;
			}
		}
		console.log(style, JSON.stringify(report, null, 1));
		for (const [key, value] of Object.entries(report)) {
			if (key.endsWith("caption")) {
				expect(value, `${style} ${key}: a caption is drawn`).toBeGreaterThan(0.01);
			} else {
				// Text antialiasing and sub-pixel placement differ slightly between the browser
				// and canvas, as they already do for the original caption look.
				expect(value, `${style} ${key}: paths match`).toBeLessThan(0.012);
			}
		}
		expect(errors).toEqual([]);
	});
}

test("Reveal shows one word, then two, then the whole caption", async ({ page }) => {
	test.setTimeout(120_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await open(page, { captions, captionStyle: "reveal" });
	const words = page.locator("[data-caption-word]");
	const counts: number[] = [];
	for (const time of [1.2, 1.7, 2.5]) {
		await expect
			.poll(async () => {
				await page.evaluate((t) => window.parity.seek(t), time);
				return Number(await page.locator("main").getAttribute("data-time"));
			})
			.toBeCloseTo(time, 1);
		counts.push(await words.count());
	}
	expect(counts).toEqual([1, 2, 3]);
});

for (const theme of ["light", "dark"] as const) {
	test(`caption style picker and the export option (${theme})`, async ({ page }) => {
		test.setTimeout(60_000);
		await installDesktopBridge(page, "filmstrip.mp4");
		await page.addInitScript((cues) => {
			const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI;
			const read = api.getAppSetting as (key: string) => unknown;
			Object.assign(api, {
				getAppSetting: (key: string) => {
					const stored = sessionStorage.getItem(`setting:${key}`);
					return stored === null ? read(key) : JSON.parse(stored);
				},
				setAppSetting: (key: string, value: unknown) => {
					sessionStorage.setItem(`setting:${key}`, JSON.stringify(value));
					return true;
				},
				getWhisperSmallModelStatus: async () => ({
					success: true,
					exists: true,
					path: "/model.bin",
				}),
				generateAutoCaptions: async () => ({ success: true, cues }),
			});
		}, captions);
		if (theme === "dark") await page.emulateMedia({ colorScheme: "dark" });
		await page.goto("/?windowType=editor");
		await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
			timeout: 20000,
		});
		if (theme === "dark") {
			await page.evaluate(() => document.documentElement.classList.add("dark"));
		}
		await page.getByRole("radio", { name: "Captions", exact: true }).click();
		const show = page.getByRole("switch", { name: "Show", exact: true });
		await page
			.locator('[data-slot="switch"]')
			.filter({ has: show })
			.locator('[data-slot="switch-control"]')
			.click({ timeout: 10000 });
		await expect(show).toBeChecked();
		await page
			.locator("[data-caption-add-target]")
			.first()
			.click({ position: { x: 100, y: 8 } });
		await expect(page.locator('[data-variant="caption"]')).toHaveCount(1);
		// Adding selects the new caption; go back to the caption settings.
		await page.keyboard.press("Escape");
		await page.getByRole("radio", { name: "Captions", exact: true }).click();
		const picker = page.getByRole("grid", { name: "Style" });
		await expect(picker.locator("[data-caption-style-preview]")).toHaveCount(3);
		// The TikTok sample draws in the bundled font once it has loaded.
		await expect
			.poll(() => page.evaluate(() => document.fonts.check('800 11px "TikTok Sans"')))
			.toBe(true);
		await picker.getByRole("row", { name: "Reveal" }).click();
		await expect(picker.getByRole("row", { name: "Reveal" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await page.mouse.move(0, 0);
		await picker.screenshot({ path: `test-results/caption-style-picker-${theme}.png` });
		const panel = picker.locator("xpath=ancestor::section[1]");
		await panel.screenshot({ path: `test-results/caption-settings-${theme}.png` });
		await page.getByRole("button", { name: "Publish" }).click();
		const publish = page.getByRole("dialog", { name: "Publish" });
		await publish.getByRole("row", { name: "Local" }).click();
		const burnIn = publish.getByRole("switch", { name: "Draw captions into the video" });
		await expect(burnIn).not.toBeChecked();
		await publish.getByText("Draw captions into the video", { exact: true }).click();
		await expect(burnIn).toBeChecked();
		await expect
			.poll(() =>
				page.evaluate(() => sessionStorage.getItem("setting:recordly.editor.preferences")),
			)
			.toContain('"burnInCaptions":true');
		await publish.screenshot({ path: `test-results/caption-export-option-${theme}.png` });
	});
}
