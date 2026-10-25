import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("HUD source label is cut short with an ellipsis", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getSelectedSource = async () => ({
			id: "window:101:0",
			name: "A very long document title that overflows the recording source control",
		});
	});
	await page.goto("/?windowType=hud-overlay");
	const source = page.getByRole("button", { name: "Choose recording source", exact: true });
	await expect(source).toContainText("A very long document title");
	const label = source.locator("span").first();
	await expect(label).toHaveCSS("text-overflow", "ellipsis");
	expect((await label.boundingBox())!.width).toBeLessThanOrEqual(168);
});

test("HUD dividers are vertically centered and Home opens the dashboard", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	const dividers = page.locator('[class*="divider"]');
	await expect(dividers.first()).toBeVisible();
	const offsets = await dividers.evaluateAll((elements) =>
		elements.map((element) => {
			const bounds = element.getBoundingClientRect();
			const parent = element.parentElement!.getBoundingClientRect();
			return Math.abs(bounds.y + bounds.height / 2 - parent.y - parent.height / 2);
		}),
	);
	for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
	const home = page.getByRole("button", { name: "Home", exact: true });
	await expect
		.poll(() =>
			home.locator("svg").evaluate((element) => ({
				width: Math.round(element.getBoundingClientRect().width),
				height: Math.round(element.getBoundingClientRect().height),
			})),
		)
		.toEqual({ width: 20, height: 20 });
	// Recording starts from the picked window or screen, not from the bar.
	await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
	await page.screenshot({ path: "test-results/hud-idle.png", animations: "disabled" });
	await home.click();
	await expect(page.locator("html")).toHaveAttribute("data-dashboard-opened", "true");
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("dialog", { name: "Projects dashboard" })).toBeVisible();
});

test("recording bar shows the time and sends its commands to the start bar", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getRecordingControlsStatus = async () => ({
			paused: false,
			elapsed: 65,
		});
		window.electronAPI.sendRecordingControlsCommand = (command) => {
			const html = document.documentElement;
			html.dataset.commands = [html.dataset.commands, command].filter(Boolean).join(",");
		};
	});
	await page.goto("/?windowType=recording-controls");
	const controls = page.getByRole("group", { name: "Recording controls" });
	await expect(controls.getByRole("status")).toHaveText("01:05");
	await controls.getByRole("button", { name: "Pause", exact: true }).click();
	await controls.getByRole("button", { name: "Stop", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("data-commands", "pause,stop");
	await page.screenshot({ path: "test-results/hud-recording.png" });
});

test("the webcam bubble shows outside the editor and closes in it", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getEditorMode = async () => true;
		window.electronAPI.onEditorModeChanged = (callback) => {
			const listener = (event: Event) => callback((event as CustomEvent<boolean>).detail);
			window.addEventListener("test-editor-mode", listener);
			return () => window.removeEventListener("test-editor-mode", listener);
		};
		window.electronAPI.getRecordingPreferences = async () => ({
			success: true,
			microphoneEnabled: false,
			webcamEnabled: true,
			systemAudioEnabled: false,
		});
		navigator.mediaDevices.enumerateDevices = async () => [];
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	await expect(html).toHaveAttribute("data-webcam-bubble", "false");
	await page.evaluate(() =>
		window.dispatchEvent(new CustomEvent("test-editor-mode", { detail: false })),
	);
	await expect(html).toHaveAttribute("data-webcam-bubble", "true");
	await page.evaluate(() =>
		window.dispatchEvent(new CustomEvent("test-editor-mode", { detail: true })),
	);
	await expect(html).toHaveAttribute("data-webcam-bubble", "false");
});

test("the webcam bubble window plays the camera", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			const canvas = document.createElement("canvas");
			canvas.width = 320;
			canvas.height = 320;
			const context = canvas.getContext("2d")!;
			context.fillStyle = "#2874ff";
			setInterval(() => context.fillRect(0, 0, 320, 320), 100);
			return canvas.captureStream(24);
		};
	});
	await page.goto("/?windowType=webcam-bubble");
	const video = page.locator("video");
	await expect
		.poll(() =>
			video.evaluate(
				(element: HTMLVideoElement) =>
					!!element.srcObject && !element.paused && element.videoWidth === 320,
			),
		)
		.toBe(true);
});
