import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

const ICON =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

// Front to back: Notes overlaps the left part of Safari.
const windows = [
	{
		id: "window:101:0",
		appName: "Notes",
		title: "Launch checklist",
		display_id: "1",
		pid: 4242,
		appIcon: ICON,
		x: 160,
		y: 140,
		width: 620,
		height: 460,
	},
	{
		id: "window:102:0",
		appName: "Safari",
		title: "Release notes",
		display_id: "1",
		pid: 4343,
		x: 520,
		y: 220,
		width: 760,
		height: 560,
	},
];

async function openPicker(
	page: Page,
	mode: "display" | "window" | "area",
	options: { windows?: typeof windows; menuChoice?: string | null } = {},
) {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(
		page,
		({ pickerWindows, mode, menuChoice }) => {
			// Looked up on use: the element present when this script runs is replaced on load.
			const html = {
				get dataset() {
					return document.documentElement.dataset;
				},
			};
			const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI;
			Object.assign(api, {
				getCapturePickerContext: async () => ({
					displayBounds: { x: 0, y: 0, width: 1440, height: 1000 },
					lastArea: null,
					allowArea: true,
					mode,
					displayName: "Built-in Retina Display",
					refreshRate: 119.88,
					windows: pickerWindows,
					cursor: null,
				}),
				completeCapturePick: async (pick: unknown) => {
					html.dataset.pick = JSON.stringify(pick);
				},
				capturePickerReady: () => {
					html.dataset.pickerReady = "true";
				},
				hudShowMenu: async (request: { items: unknown[] }) => {
					html.dataset.menu = JSON.stringify(request.items);
					return menuChoice;
				},
				capturePickerResizeWindow: async (
					windowId: string,
					size: { width: number; height: number },
				) => {
					html.dataset.resize = JSON.stringify({ windowId, ...size });
					return { success: true, frame: { x: 160, y: 140, ...size } };
				},
			});
		},
		{ pickerWindows: options.windows ?? windows, mode, menuChoice: options.menuChoice ?? null },
	);
	await page.goto("/?windowType=capture-picker&displayId=1");
	await expect(page.locator("html")).toHaveAttribute("data-picker-ready", "true");
}

async function pick(page: Page) {
	const value = await page.locator("html").getAttribute("data-pick");
	return value ? JSON.parse(value) : undefined;
}

test("Display mode highlights the whole screen with its name, size and frame rate", async ({
	page,
}) => {
	await openPicker(page, "display");
	await page.mouse.move(600, 300); // over a window: Display mode still means the screen
	await expect(page.getByText("Built-in Retina Display", { exact: true })).toBeVisible();
	await expect(page.getByText("1440 × 1000 · 120FPS", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Start recording", exact: true }).click();
	expect(await pick(page)).toEqual({ kind: "screen", displayId: 1, record: true });
});

test("Display mode offers every screen, even the one the pointer is not on", async ({ page }) => {
	await openPicker(page, "display");
	const start = page.getByRole("button", { name: "Start recording", exact: true });
	const tinted = () =>
		page
			.locator("div.fixed > div")
			.first()
			.evaluate((element) =>
				getComputedStyle(element).backgroundImage.includes("90, 67, 245"),
			);
	await expect(start).toBeVisible();
	await page.mouse.move(600, 300);
	await expect.poll(tinted).toBe(true);
	await page.mouse.move(-10, -10); // the pointer goes to another screen
	await page.dispatchEvent("div.fixed", "pointerleave");
	await expect(start).toBeVisible();
	await expect.poll(tinted).toBe(false);
	await expect(page.getByText(/Esc to cancel/)).toHaveCount(0);
});

test("A hovered window's icon sways, and the picker tells the bar", async ({ page }) => {
	await openPicker(page, "window");
	const html = page.locator("html");
	await page.mouse.move(600, 300);
	await expect(page.locator("img.hover-sway")).toHaveCount(1);
	await expect(html).toHaveAttribute("data-window-hover", "true");
	const moved = await page
		.locator("img.hover-sway")
		.evaluate((element) => getComputedStyle(element).animationName);
	expect(moved).toBe("hover-sway");
	await page.mouse.move(1380, 60); // the desktop
	await expect(html).toHaveAttribute("data-window-hover", "false");
});

test("Window mode shows the icon and Start recording only on the hovered window", async ({
	page,
}) => {
	await openPicker(page, "window");
	await page.mouse.move(1380, 60); // empty desktop: everything stays dimmed
	await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
	await expect(page.locator("img")).toHaveCount(0);
	await page.mouse.move(600, 300);
	await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(1);
	await expect(page.locator("img")).toHaveCount(1);
	await expect(page.getByRole("button", { name: "Start recording" })).toHaveText(
		"Start recording",
	);
});

test("Window mode shows the app's icon, name, size, Resize and Adjust recording area", async ({
	page,
}) => {
	await openPicker(page, "window");
	await page.mouse.move(1380, 60); // empty desktop: nothing to pick in Window mode
	await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
	await page.mouse.click(1380, 60);
	expect(await pick(page)).toBeUndefined();

	await page.mouse.move(600, 300);
	await expect(page.getByText("Notes", { exact: true })).toBeVisible();
	await expect(page.getByText("620 × 460", { exact: true })).toBeVisible();
	await expect(page.locator(`img[src="${ICON}"]`)).toBeVisible();
	await expect(page.getByRole("button", { name: "Resize", exact: true })).toBeVisible();
	const adjust = page.getByRole("button", { name: "Adjust recording area", exact: true });
	await expect(adjust).toBeVisible();
	const resize = page.getByRole("button", { name: "Resize", exact: true });
	await expect
		.poll(async () => [
			(await resize.boundingBox())?.height,
			(await adjust.boundingBox())?.height,
		])
		.toEqual([32, 32]);
	// It sits at the bottom of the window (Notes ends at y = 600), not under Start recording.
	const box = await adjust.boundingBox();
	expect(600 - (box!.y + box!.height)).toBeGreaterThanOrEqual(12);
	expect(600 - (box!.y + box!.height)).toBeLessThanOrEqual(20);
	await page.screenshot({ path: "test-results/picker-window-card.png" });
	await page.getByRole("button", { name: "Start recording", exact: true }).click();
	expect(await pick(page)).toEqual({
		kind: "window",
		windowId: "window:101:0",
		displayId: 1,
		record: true,
	});
});

test("Window mode with no windows offers to record the entire display", async ({ page }) => {
	await openPicker(page, "window", { windows: [] });
	await expect(page.getByText("No windows to select", { exact: true })).toBeVisible();
	await page.screenshot({ path: "test-results/picker-no-windows.png" });
	await page.getByRole("button", { name: "Record entire display", exact: true }).click();
	expect(await pick(page)).toEqual({ kind: "screen", displayId: 1, record: true });
});

test("Resize sets the window to a preset size from the menu", async ({ page }) => {
	await openPicker(page, "window", { menuChoice: "1280x720" });
	await page.mouse.move(600, 300);
	await page.getByRole("button", { name: "Resize", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-resize",
		JSON.stringify({ windowId: "window:101:0", width: 1280, height: 720 }),
	);
	await expect(page.getByText("1280 × 720", { exact: true })).toBeVisible();
	const menu = JSON.parse((await page.locator("html").getAttribute("data-menu"))!);
	expect(menu.map((item: { label?: string }) => item.label)).toEqual([
		"1280 × 720",
		"1920 × 1080",
		"2560 × 1440",
		undefined,
		"4:3",
		"9:16",
		"16:10",
		"Square",
	]);
	// Presets bigger than this 1440 × 1000 screen are offered but greyed out.
	expect(menu[2].enabled).toBe(false);
});

test("Adjust recording area turns the window into an editable area", async ({ page }) => {
	await openPicker(page, "window");
	await page.mouse.move(600, 300);
	await page.getByRole("button", { name: "Adjust recording area", exact: true }).click();
	await expect(page.locator("[data-area-handle]")).toHaveCount(8);
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("620");
	await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue("460");
	await page.keyboard.press("Escape");
	expect(await pick(page)).toBeNull();
});

test("Area mode takes typed sizes and aspect ratios around the area's centre", async ({ page }) => {
	await openPicker(page, "area", { menuChoice: "16:9" });
	await page.mouse.move(600, 300); // hovering a window does not pick it in Area mode
	await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
	await page.mouse.down();
	await page.mouse.move(1000, 600, { steps: 6 });
	await page.mouse.up();
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("400");
	await page.getByRole("spinbutton", { name: "Width" }).fill("800");
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("800");
	await page.getByRole("button", { name: "Aspect ratio", exact: true }).click();
	await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue("450");
	// The controls sit on their own panel, without an "Area" title.
	await expect(page.getByText("Area", { exact: true })).toHaveCount(0);
	await page.screenshot({ path: "test-results/picker-area-panel.png" });
	await page.getByRole("button", { name: "Start recording", exact: true }).click();
	// 400 × 300 at (600, 300) grows around its centre (800, 450) to 800 × 450.
	expect(await pick(page)).toEqual({
		kind: "area",
		x: 400,
		y: 225,
		width: 800,
		height: 450,
		displayId: 1,
		record: true,
	});
});

test("A locked aspect ratio holds while the area's handles are dragged", async ({ page }) => {
	await openPicker(page, "area", { menuChoice: "16:9" });
	await page.mouse.move(600, 300);
	await page.mouse.down();
	await page.mouse.move(1000, 600, { steps: 6 });
	await page.mouse.up();
	await page.getByRole("button", { name: "Aspect ratio", exact: true }).click();
	// 400 × 225 at (600, 337.5); drag the bottom-right corner 160 px right.
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("400");
	await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue("225");
	const corner = page.locator('[data-area-handle="se"]');
	const box = (await corner.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 6 });
	await page.mouse.up();
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("560");
	await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue("315");
});

test("Switching from Display to Window in the bar changes the open picker", async ({ page }) => {
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.onCapturePickerModeChanged = (callback) => {
			const listener = (event: Event) =>
				callback((event as CustomEvent<"display" | "window" | "area">).detail);
			window.addEventListener("test-picker-mode", listener);
			return () => window.removeEventListener("test-picker-mode", listener);
		};
	});
	await openPicker(page, "display");
	const start = page.getByRole("button", { name: "Start recording" });
	await expect(start).toHaveCount(1);
	await page.mouse.move(-10, -10); // over the bar, off this screen
	await page.dispatchEvent("div.fixed", "pointerleave");
	await page.evaluate(() =>
		window.dispatchEvent(new CustomEvent("test-picker-mode", { detail: "window" })),
	);
	await expect(start).toHaveCount(0); // Window mode waits for a hovered window
	await page.mouse.move(600, 300);
	await expect(page.getByText("Notes", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Start recording", exact: true }).click();
	expect(await pick(page)).toMatchObject({ kind: "window", windowId: "window:101:0" });
});

test("A typed size too big for the screen keeps the locked aspect ratio", async ({ page }) => {
	await openPicker(page, "area", { menuChoice: "16:9" });
	await page.mouse.move(600, 300);
	await page.mouse.down();
	await page.mouse.move(1000, 600, { steps: 6 });
	await page.mouse.up();
	await page.getByRole("button", { name: "Aspect ratio", exact: true }).click();
	await page.getByRole("spinbutton", { name: "Width" }).fill("3000");
	// 3000 × 1688 does not fit 1440 × 1000, so it shrinks as a whole to 1440 × 810.
	await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue("1440");
	await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue("810");
});
