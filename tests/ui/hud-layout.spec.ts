import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("Display, Window and Area each show their icon over their label", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	for (const [name, label] of [
		["Record a display", "Display"],
		["Record a window", "Window"],
		["Record an area", "Area"],
	]) {
		const button = page.getByRole("button", { name, exact: true });
		await expect(button).toHaveText(label);
		const [icon, text] = await Promise.all([
			button.locator("svg").boundingBox(),
			button.locator("span").boundingBox(),
		]);
		expect(icon!.y + icon!.height).toBeLessThanOrEqual(text!.y + 1);
	}
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
		.toEqual({ width: 24, height: 24 });
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
	// Tall enough for both of macOS's 27 pt corners.
	expect((await controls.boundingBox())?.height).toBe(54);
	expect(
		await controls.evaluate((element) => getComputedStyle(element).borderTopRightRadius),
	).toBe("27px");
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

test("the Window icon sways while the picker's pointer is over a window", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.onCapturePickerWindowHover = (callback) => {
			const listener = (event: Event) => callback((event as CustomEvent<boolean>).detail);
			window.addEventListener("test-window-hover", listener);
			return () => window.removeEventListener("test-window-hover", listener);
		};
	});
	await page.goto("/?windowType=hud-overlay");
	const icon = page.getByRole("button", { name: "Record a window", exact: true }).locator("svg");
	const swaying = () => icon.evaluate((element) => getComputedStyle(element).animationName);
	await expect.poll(swaying).toBe("none");
	await page.evaluate(() =>
		window.dispatchEvent(new CustomEvent("test-window-hover", { detail: true })),
	);
	await expect.poll(swaying).toBe("hover-sway");
	await expect(
		page.getByRole("button", { name: "Record a display", exact: true }).locator("svg"),
	).not.toHaveClass(/hover-sway/);
	await page.evaluate(() =>
		window.dispatchEvent(new CustomEvent("test-window-hover", { detail: false })),
	);
	await expect.poll(swaying).toBe("none");
});

test("the bar switches an open picker to another mode", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		// The picker stays open until a mode is chosen there.
		window.electronAPI.pickCaptureTarget = () =>
			new Promise(() => {
				document.documentElement.dataset.pickerOpen = "true";
			});
	});
	await page.goto("/?windowType=hud-overlay");
	const display = page.getByRole("button", { name: "Record a display", exact: true });
	const windowButton = page.getByRole("button", { name: "Record a window", exact: true });
	await display.click();
	await expect(display).toHaveAttribute("data-active", "true");
	await expect(windowButton).toBeEnabled();
	await windowButton.click();
	await expect(page.locator("html")).toHaveAttribute("data-picker-mode", "window");
	await expect(windowButton).toHaveAttribute("data-active", "true");
	await expect(display).not.toHaveAttribute("data-active", "true");
});

test("one hover fill fades in, then glides between the bar's buttons", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	const highlight = page.locator('[class*="highlight"]');
	const display = page.getByRole("button", { name: "Record a display", exact: true });
	const area = page.getByRole("button", { name: "Record an area", exact: true });
	const placed = async () => {
		const [fill, bar] = await Promise.all([
			highlight.boundingBox(),
			highlight.locator("..").boundingBox(),
		]);
		return fill && bar ? Math.round(fill.x - bar.x) : null;
	};
	await expect(highlight).not.toHaveAttribute("data-shown");
	await display.hover();
	// Arriving from outside: it appears where the pointer is, without sliding.
	await expect(highlight).toHaveAttribute("data-shown", "");
	await expect(highlight).not.toHaveAttribute("data-gliding");
	const displayLeft = Math.round(
		(await display.boundingBox())!.x - (await highlight.locator("..").boundingBox())!.x,
	);
	await expect.poll(placed).toBe(displayLeft);
	await area.hover();
	await expect(highlight).toHaveAttribute("data-gliding", "");
	const areaLeft = Math.round(
		(await area.boundingBox())!.x - (await highlight.locator("..").boundingBox())!.x,
	);
	await expect.poll(placed).toBe(areaLeft);
	await page.mouse.move(5, 400); // off the bar
	await expect(highlight).not.toHaveAttribute("data-shown");
});

test("a mode clicked while the picker is still opening is the one it opens in", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		const api = window.electronAPI;
		// The permission check takes a while, as when a prompt is up.
		api.getPlatform = () =>
			new Promise((resolve) => {
				(window as unknown as { finishCheck: () => void }).finishCheck = () =>
					resolve("linux");
			});
		api.pickCaptureTarget = (mode) =>
			new Promise(() => {
				document.documentElement.dataset.pickedMode = String(mode);
			});
	});
	await page.goto("/?windowType=hud-overlay");
	await page.getByRole("button", { name: "Record a display", exact: true }).click();
	await page.getByRole("button", { name: "Record a window", exact: true }).click();
	await page.evaluate(() => (window as unknown as { finishCheck: () => void }).finishCheck());
	await expect(page.locator("html")).toHaveAttribute("data-picked-mode", "window");
});

test("the mic meter listens only while the bar is on screen and outside the editor", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		const html = () => document.documentElement;
		const api = window.electronAPI;
		api.getRecordingPreferences = async () => ({
			success: true,
			microphoneEnabled: true,
			webcamEnabled: false,
			systemAudioEnabled: false,
		});
		api.getEditorMode = async () => false;
		const subscribeTo = (name: string) => (callback: (value: boolean) => void) => {
			const listener = (event: Event) => callback((event as CustomEvent<boolean>).detail);
			window.addEventListener(name, listener);
			return () => window.removeEventListener(name, listener);
		};
		api.onEditorModeChanged = subscribeTo("test-editor-mode");
		api.onHudVisibilityChanged = subscribeTo("test-visible");
		api.hudIsVisible = async () => true;
		let open = 0;
		navigator.mediaDevices.getUserMedia = async () => {
			const context = new AudioContext();
			const stream = context.createMediaStreamDestination().stream;
			open += 1;
			html().dataset.micOpen = String(open);
			for (const track of stream.getTracks()) {
				const stop = track.stop.bind(track);
				track.stop = () => {
					stop();
					open -= 1;
					html().dataset.micOpen = String(open);
				};
			}
			return stream;
		};
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	const send = (name: string, detail: boolean) =>
		page.evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(n, { detail: d })), [
			name,
			detail,
		] as const);
	await expect(html).toHaveAttribute("data-mic-open", "1");
	await send("test-visible", false); // the bar is hidden
	await expect(html).toHaveAttribute("data-mic-open", "0");
	await send("test-visible", true);
	await expect(html).toHaveAttribute("data-mic-open", "1");
	await send("test-editor-mode", true); // the editor opens
	await expect(html).toHaveAttribute("data-mic-open", "0");
});

test("the hover fill clears when a menu closes and glides across short gaps", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	const highlight = page.locator('[class*="highlight"]');
	const display = page.getByRole("button", { name: "Record a display", exact: true });
	const area = page.getByRole("button", { name: "Record an area", exact: true });
	await display.hover();
	await expect(highlight).toHaveAttribute("data-shown", "");
	// A brief exit, as over the bar's draggable gaps, does not reset it.
	await page.locator('[class*="bar"]').first().dispatchEvent("pointerleave");
	await area.hover();
	await expect(highlight).toHaveAttribute("data-gliding", "");
	// A native menu closing lets go of it.
	await page
		.getByRole("button", { name: /microphone/i })
		.first()
		.click();
	await expect(highlight).not.toHaveAttribute("data-shown");
});

test("Escape on the bar closes an open picker", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.pickCaptureTarget = () =>
			new Promise(() => {
				document.documentElement.dataset.pickerOpen = "true";
			});
	});
	await page.goto("/?windowType=hud-overlay");
	await page.getByRole("button", { name: "Record a window", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("data-picker-open", "true");
	await page.keyboard.press("Escape");
	await expect(page.locator("html")).toHaveAttribute("data-picker-cancelled", "true");
});

test("hovering a button turns its icon and text white", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	const audio = page.getByRole("button", { name: /system audio/i }).first();
	const display = page.getByRole("button", { name: "Record a display", exact: true });
	const label = display.locator("span");
	const colour = (locator: typeof audio) =>
		locator.evaluate((element) => getComputedStyle(element).color);
	await expect.poll(() => colour(label)).toBe("rgba(255, 255, 255, 0.6)");
	await display.hover();
	await expect.poll(() => colour(label)).toBe("rgb(255, 255, 255)");
	await audio.hover();
	await expect.poll(() => colour(audio)).toBe("rgb(255, 255, 255)");
	expect((await display.boundingBox())?.width).toBe(60);
});

test("on Liquid Glass the bars leave the fill and edge to the glass", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		(window as unknown as { __testGlass: boolean }).__testGlass = true;
	});
	await page.goto("/?windowType=hud-overlay");
	const bar = page.locator('[class*="bar"]').first();
	await expect(bar).toHaveClass(/onGlass/);
	expect(await bar.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
		"rgba(0, 0, 0, 0)",
	);
	expect(await bar.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
	await page.goto("/?windowType=recording-controls");
	await expect(page.getByRole("group", { name: "Recording controls" })).toHaveClass(/onGlass/);
});

test("without Liquid Glass the bars keep their own frosted fill and edge", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=hud-overlay");
	const bar = page.locator('[class*="bar"]').first();
	await expect(bar).not.toHaveClass(/onGlass/);
	expect(await bar.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
});

test("pressing a button and moving drags the bar instead of clicking", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.pickCaptureTarget = (mode) =>
			new Promise(() => {
				document.documentElement.dataset.picked = String(mode);
			});
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	const display = page.getByRole("button", { name: "Record a display", exact: true });
	const box = (await display.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 6, { steps: 8 });
	await page.mouse.up();
	await expect(html).toHaveAttribute("data-drag", /^start,(move,)*move,end$/);
	await page.waitForTimeout(200);
	await expect(html).not.toHaveAttribute("data-picked");

	// A plain click still clicks, and doesn't drag.
	await page.evaluate(() => delete document.documentElement.dataset.drag);
	await display.click();
	await expect(html).toHaveAttribute("data-picked", "display");
	await expect(html).not.toHaveAttribute("data-drag");
});

test("the recording bar drags from anywhere too", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=recording-controls");
	const timer = page.getByRole("group", { name: "Recording controls" }).getByRole("status");
	const box = (await timer.boundingBox())!;
	await page.mouse.move(box.x + 5, box.y + 5);
	await page.mouse.down();
	await page.mouse.move(box.x + 60, box.y + 5, { steps: 6 });
	await page.mouse.up();
	await expect(page.locator("html")).toHaveAttribute("data-drag", /^start,.*end$/);
});
