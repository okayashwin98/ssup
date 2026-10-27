import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	type MenuItemConstructorOptions,
	Notification,
	type Rectangle,
} from "electron";
import { USER_DATA_PATH } from "./appPaths";
import { getPrebundledNativeHelperPath } from "./ipc/paths/binaries";

// Screen Studio-style recording windows: the start bar, the small bar shown while
// recording, and the floating webcam bubble are each a small panel of their own,
// so they float over other apps and move between displays like normal windows.

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(electronDir, "..", "dist");

// Development only: lets tools inspect these windows' pages.
if (VITE_DEV_SERVER_URL && process.env.RECORDLY_DEV_DEBUG_PORT) {
	app.commandLine.appendSwitch("remote-debugging-port", process.env.RECORDLY_DEV_DEBUG_PORT);
}

export const HUD_BAR_BOTTOM_MARGIN_DIP = 24;
const RECORDING_BAR_DEFAULT_SIZE = { width: 300, height: 54 };
const WEBCAM_BUBBLE_DEFAULT_SIZE = 288;
const WEBCAM_BUBBLE_MIN_SIZE = 120;
const WEBCAM_BUBBLE_MAX_SIZE = 480;
const WEBCAM_BUBBLE_SETTINGS_FILE = path.join(USER_DATA_PATH, "webcam-bubble.json");

export type RecordingControlsCommand = "stop" | "pause" | "resume" | "cancel" | "hide";

export interface RecordingControlsStatus {
	paused: boolean;
	elapsed: number;
}

export interface HudMenuItem {
	id?: string;
	label?: string;
	type?: "normal" | "checkbox" | "radio" | "separator" | "header";
	checked?: boolean;
	enabled?: boolean;
	/** A submenu, like Screen Studio's aspect-ratio groups of sizes. */
	submenu?: HudMenuItem[];
}

let recordingControlsWindow: BrowserWindow | null = null;
let recordingControlsHiddenByUser = false;
let recordingStatus: RecordingControlsStatus = { paused: false, elapsed: 0 };
let webcamBubbleWindow: BrowserWindow | null = null;
let webcamBubbleDeviceId: string | undefined;
let getHudWindow: () => BrowserWindow | null = () => null;
let applyCaptureProtection: (win: BrowserWindow) => void = () => undefined;

function getScreen() {
	return nodeRequire("electron").screen as typeof import("electron").screen;
}

function alive(win: BrowserWindow | null): win is BrowserWindow {
	return Boolean(win && !win.isDestroyed());
}

function loadRendererWindow(win: BrowserWindow, windowType: string) {
	if (VITE_DEV_SERVER_URL) {
		// Development only: show these small windows' console output in the terminal.
		win.webContents.on("console-message", (details) => {
			if (details.level === "warning" || details.level === "error") {
				console.log(`[${windowType}] ${details.message}`);
			}
		});
		void win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=${windowType}`);
	} else {
		void win.loadFile(path.join(RENDERER_DIST, "index.html"), { query: { windowType } });
	}
}

// The glass bars' corner radius, measured from Screen Studio's bar (it also matches the
// rounding the frosted bar had). The glass draws the corner itself, so the window
// itself is left square.
const GLASS_CORNER_RADIUS = 16;

export type GlassRect = { x: number; y: number; width: number; height: number; radius: number };
type LiquidGlass = {
	addGlass: (handle: Buffer, cornerRadius: number) => boolean;
	setGlassRects: (handle: Buffer, rects: GlassRect[]) => boolean;
};
let liquidGlass: LiquidGlass | null | undefined;

/** Apple's Liquid Glass add-on (macOS 26+), or null where it can't be used. */
function loadLiquidGlass(): LiquidGlass | null {
	if (liquidGlass === undefined) liquidGlass = requireLiquidGlass();
	return liquidGlass;
}

function requireLiquidGlass(): LiquidGlass | null {
	const major = Number(process.getSystemVersion().split(".")[0]);
	if (process.platform !== "darwin" || !(major >= 26)) return null;
	try {
		return nodeRequire(getPrebundledNativeHelperPath("recordly-liquid-glass.node"));
	} catch (error) {
		console.warn("[liquid-glass] Unavailable; the bars keep their frosted look:", error);
		return null;
	}
}

/** Whether Liquid Glass can be used on this Mac. */
export function liquidGlassAvailable(): boolean {
	return loadLiquidGlass() !== null;
}

/** Puts Liquid Glass under only these parts of a window (top-left points); [] removes it. */
export function setWindowGlassRects(win: BrowserWindow, rects: GlassRect[]): boolean {
	const glass = loadLiquidGlass();
	if (!glass || win.isDestroyed()) return false;
	try {
		return glass.setGlassRects(win.getNativeWindowHandle(), rects);
	} catch (error) {
		console.warn("[liquid-glass] Could not place glass:", error);
		return false;
	}
}

// Bar windows that have Liquid Glass under them; their pages drop their own fill and edge.
const glassWindowIds = new Set<number>();

/** Whether a window sits on Liquid Glass (its page asks while loading). */
export function windowHasLiquidGlass(win: BrowserWindow | null): boolean {
	return Boolean(win && glassWindowIds.has(win.id));
}

/**
 * A small non-activating panel that floats above apps, full-screen apps included. With
 * `glass`, it sits on Apple's Liquid Glass with the macOS shadow, as Screen Studio's bar
 * does; before macOS 26, or if that fails, on frosted glass without a shadow.
 */
export function createFloatingPanel(
	bounds: Rectangle,
	options: { glass: boolean; resizable?: boolean },
): BrowserWindow {
	const glass = options.glass ? loadLiquidGlass() : null;
	const frosted = options.glass && !glass;
	const win = new BrowserWindow({
		...bounds,
		type: process.platform === "darwin" ? "panel" : undefined,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		...(frosted ? { vibrancy: "hud" as const, visualEffectState: "active" as const } : {}),
		roundedCorners: frosted,
		// Liquid Glass keeps macOS's shadow and its crisp outline, as Screen Studio's bar has.
		// The frosted fallback goes without: there the shadow can only be on or off, and on
		// it was too strong; the bar's own edge outlines it instead.
		hasShadow: Boolean(glass),
		// The bars never take the keyboard, like Screen Studio's: a window with the keyboard
		// gets macOS's much larger shadow, and the picker keeps Escape and Enter. Clicks,
		// menus and dragging work all the same.
		focusable: !options.glass,
		resizable: options.resizable ?? false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		show: false,
		webPreferences: {
			preload: path.join(electronDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});
	if (glass) {
		try {
			if (glass.addGlass(win.getNativeWindowHandle(), GLASS_CORNER_RADIUS)) {
				glassWindowIds.add(win.id);
				const id = win.id;
				win.once("closed", () => glassWindowIds.delete(id));
			}
		} catch (error) {
			console.warn("[liquid-glass] Could not add glass to a bar:", error);
		}
		// No glass after all: fall back to the frosted look.
		if (!glassWindowIds.has(win.id)) {
			win.setVibrancy("hud");
			win.setHasShadow(false);
		}
	}
	// Like Screen Studio's bar: above normal and floating windows, below system alerts.
	win.setAlwaysOnTop(true, "status", 1);
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, {
			visibleOnFullScreen: true,
			skipTransformProcessType: true,
		});
	}
	return win;
}

/** Bottom-centre of a work area, the bar's home position. */
export function bottomCentreBounds(
	workArea: Rectangle,
	size: { width: number; height: number },
): Rectangle {
	return {
		x: Math.round(workArea.x + (workArea.width - size.width) / 2),
		y: Math.round(workArea.y + workArea.height - size.height - HUD_BAR_BOTTOM_MARGIN_DIP),
		width: size.width,
		height: size.height,
	};
}

/** Resizes a bar window to its content, keeping its bottom centre where it is. */
export function resizeKeepingBottomCentre(
	current: Rectangle,
	size: { width: number; height: number },
	workArea: Rectangle,
): Rectangle {
	const centreX = current.x + current.width / 2;
	const bottom = current.y + current.height;
	const x = Math.round(centreX - size.width / 2);
	const y = Math.round(bottom - size.height);
	return {
		x: Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - size.width),
		y: Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - size.height),
		width: size.width,
		height: size.height,
	};
}

export function getRecordingControlsWindow(): BrowserWindow | null {
	return alive(recordingControlsWindow) ? recordingControlsWindow : null;
}

export function getWebcamBubbleWindow(): BrowserWindow | null {
	return alive(webcamBubbleWindow) ? webcamBubbleWindow : null;
}

/** Windows that must follow the HUD's capture protection. */
export function getHudCompanionWindows(): BrowserWindow[] {
	return [getRecordingControlsWindow(), getWebcamBubbleWindow()].filter(
		(win): win is BrowserWindow => win !== null,
	);
}

/** Opens the recording bar where the start bar was, and hides the start bar. */
export function showRecordingControls(anchor: Rectangle | null) {
	recordingControlsHiddenByUser = false;
	recordingStatus = { paused: false, elapsed: 0 };
	let win = getRecordingControlsWindow();
	if (!win) {
		const screen = getScreen();
		const display = anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
		const bounds = anchor
			? resizeKeepingBottomCentre(anchor, RECORDING_BAR_DEFAULT_SIZE, display.workArea)
			: bottomCentreBounds(display.workArea, RECORDING_BAR_DEFAULT_SIZE);
		win = createFloatingPanel(bounds, { glass: true });
		recordingControlsWindow = win;
		applyCaptureProtection(win);
		win.once("ready-to-show", () => {
			if (alive(win) && !recordingControlsHiddenByUser) win.showInactive();
		});
		win.on("closed", () => {
			if (recordingControlsWindow === win) recordingControlsWindow = null;
		});
		loadRendererWindow(win, "recording-controls");
	} else if (!win.isVisible()) {
		win.showInactive();
	}
}

export function closeRecordingControls() {
	const win = getRecordingControlsWindow();
	recordingControlsWindow = null;
	win?.destroy();
}

/** Brings back a recording bar the user hid; false when no recording bar exists. */
export function revealRecordingControls(): boolean {
	const win = getRecordingControlsWindow();
	if (!win) return false;
	recordingControlsHiddenByUser = false;
	win.showInactive();
	win.moveTop();
	return true;
}

export function hideRecordingControls(): boolean {
	const win = getRecordingControlsWindow();
	if (!win) return false;
	recordingControlsHiddenByUser = true;
	win.hide();
	return true;
}

function readWebcamBubbleBounds(): Rectangle | null {
	try {
		const saved = JSON.parse(fs.readFileSync(WEBCAM_BUBBLE_SETTINGS_FILE, "utf-8"));
		const size = Math.min(
			Math.max(Number(saved.size) || WEBCAM_BUBBLE_DEFAULT_SIZE, WEBCAM_BUBBLE_MIN_SIZE),
			WEBCAM_BUBBLE_MAX_SIZE,
		);
		const bounds = {
			x: Math.round(saved.x),
			y: Math.round(saved.y),
			width: size,
			height: size,
		};
		const onScreen = getScreen()
			.getAllDisplays()
			.some(
				({ workArea }) =>
					bounds.x >= workArea.x &&
					bounds.y >= workArea.y &&
					bounds.x + size <= workArea.x + workArea.width &&
					bounds.y + size <= workArea.y + workArea.height,
			);
		return Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && onScreen ? bounds : null;
	} catch {
		return null;
	}
}

function saveWebcamBubbleBounds(win: BrowserWindow) {
	const { x, y, width } = win.getBounds();
	try {
		fs.writeFileSync(WEBCAM_BUBBLE_SETTINGS_FILE, JSON.stringify({ x, y, size: width }));
	} catch {
		// A position that is not remembered is not worth an error.
	}
}

/** Shows, updates or closes the floating webcam bubble. */
export function setWebcamBubble(visible: boolean, deviceId?: string) {
	webcamBubbleDeviceId = deviceId;
	const existing = getWebcamBubbleWindow();
	if (!visible) {
		webcamBubbleWindow = null;
		existing?.destroy();
		return;
	}
	if (existing) {
		existing.webContents.send("webcam-bubble-device-changed", deviceId ?? null);
		return;
	}

	const { workArea } = getScreen().getPrimaryDisplay();
	const bounds = readWebcamBubbleBounds() ?? {
		x: workArea.x + workArea.width - WEBCAM_BUBBLE_DEFAULT_SIZE - 32,
		y: workArea.y + workArea.height - WEBCAM_BUBBLE_DEFAULT_SIZE - 120,
		width: WEBCAM_BUBBLE_DEFAULT_SIZE,
		height: WEBCAM_BUBBLE_DEFAULT_SIZE,
	};
	const win = createFloatingPanel(bounds, { glass: false, resizable: true });
	win.setAspectRatio(1);
	win.setMinimumSize(WEBCAM_BUBBLE_MIN_SIZE, WEBCAM_BUBBLE_MIN_SIZE);
	win.setMaximumSize(WEBCAM_BUBBLE_MAX_SIZE, WEBCAM_BUBBLE_MAX_SIZE);
	webcamBubbleWindow = win;
	applyCaptureProtection(win);
	win.once("ready-to-show", () => {
		if (alive(win)) win.showInactive();
	});
	// macOS sends "moved" on every step of a drag; save once it settles.
	let saveTimer: NodeJS.Timeout | null = null;
	const saveSoon = () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => alive(win) && saveWebcamBubbleBounds(win), 400);
	};
	win.on("moved", saveSoon);
	win.on("resized", saveSoon);
	win.on("closed", () => {
		if (saveTimer) clearTimeout(saveTimer);
		if (webcamBubbleWindow === win) webcamBubbleWindow = null;
	});
	loadRendererWindow(win, "webcam-bubble");
}

// macOS menu rows are 24 pt, separators 11 pt, plus 10 pt of padding (measured on macOS 27).
const MENU_FRAME_OFFSET = 5;

function estimateMenuHeight(items: HudMenuItem[]) {
	const separators = items.filter((item) => item.type === "separator").length;
	return 10 + (items.length - separators) * 24 + separators * 11;
}

function buildMenuTemplate(
	items: HudMenuItem[],
	choose: (id: string) => void,
): MenuItemConstructorOptions[] {
	return items.map((item) => {
		if (item.type === "separator") return { type: "separator" };
		if (item.type === "header") return { label: item.label ?? "", enabled: false };
		if (item.submenu) {
			return {
				label: item.label ?? "",
				enabled: item.enabled !== false,
				submenu: buildMenuTemplate(item.submenu, choose),
			};
		}
		return {
			label: item.label ?? "",
			type: item.type ?? "normal",
			checked: Boolean(item.checked),
			enabled: item.enabled !== false,
			click: () => item.id && choose(item.id),
		};
	});
}

export function registerHudCompactWindowIpc(options: {
	getHudWindow: () => BrowserWindow | null;
	applyCaptureProtection: (win: BrowserWindow) => void;
}) {
	getHudWindow = options.getHudWindow;
	applyCaptureProtection = options.applyCaptureProtection;

	// Each bar measures itself; its window follows, growing from the bottom centre.
	ipcMain.on("hud-window-set-content-size", (event, size: { width: number; height: number }) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || (win !== getHudWindow() && win !== getRecordingControlsWindow())) return;
		const width = Math.ceil(Number(size?.width));
		const height = Math.ceil(Number(size?.height));
		if (!(width > 0 && height > 0)) return;
		const current = win.getBounds();
		if (current.width === width && current.height === height) return;
		const { workArea } = getScreen().getDisplayMatching(current);
		win.setBounds(resizeKeepingBottomCentre(current, { width, height }, workArea), false);
	});

	// Native menus, as Screen Studio uses for its device and size pickers.
	ipcMain.handle(
		"hud-show-menu",
		(event, request: { items: HudMenuItem[]; x: number; y: number; above?: number }) =>
			new Promise<string | null>((resolve) => {
				const win = BrowserWindow.fromWebContents(event.sender);
				if (!win || !Array.isArray(request?.items)) {
					resolve(null);
					return;
				}
				// Opens down from `y`; when it would not fit below, it ends at `above` instead.
				let y = request.y;
				if (typeof request.above === "number") {
					const content = win.getContentBounds();
					const workArea = getScreen().getDisplayMatching(content).workArea;
					const height = estimateMenuHeight(request.items);
					if (content.y + y + height > workArea.y + workArea.height) {
						y = request.above - height;
					}
				}
				// macOS draws the menu's frame 5 pt above the point it is given.
				y += MENU_FRAME_OFFSET;
				const menu = Menu.buildFromTemplate(buildMenuTemplate(request.items, resolve));
				menu.popup({
					window: win,
					x: Math.round(request.x),
					y: Math.round(y),
					// A click resolves first; closing without one resolves null.
					callback: () => setTimeout(() => resolve(null), 50),
				});
			}),
	);

	ipcMain.on("hud-notify", (_event, payload: { title?: string; message?: string }) => {
		if (!payload?.message || !Notification.isSupported()) return;
		new Notification({
			title: payload.title || app.getName(),
			body: payload.message,
			silent: true,
		}).show();
	});

	ipcMain.on("hud-recording-status", (_event, status: RecordingControlsStatus) => {
		recordingStatus = {
			paused: Boolean(status?.paused),
			elapsed: Math.max(0, Math.floor(Number(status?.elapsed) || 0)),
		};
		getRecordingControlsWindow()?.webContents.send(
			"recording-controls-status",
			recordingStatus,
		);
	});

	ipcMain.handle("recording-controls-get-status", () => recordingStatus);

	ipcMain.on("recording-controls-command", (_event, command: RecordingControlsCommand) => {
		if (command === "hide") {
			hideRecordingControls();
			return;
		}
		if (!["stop", "pause", "resume", "cancel"].includes(command)) return;
		getHudWindow()?.webContents.send("recording-controls-command", command);
	});

	ipcMain.on(
		"hud-set-webcam-bubble",
		(_event, request: { visible: boolean; deviceId?: string }) => {
			setWebcamBubble(
				Boolean(request?.visible),
				typeof request?.deviceId === "string" ? request.deviceId : undefined,
			);
		},
	);

	ipcMain.handle("webcam-bubble-get-device", () => webcamBubbleDeviceId ?? null);

	// The recording bar is dragged from anywhere on it, like the start bar.
	let recordingBarDrag: { x: number; y: number } | null = null;
	ipcMain.on(
		"recording-controls-drag",
		(event, phase: unknown, screenX: unknown, screenY: unknown) => {
			const win = getRecordingControlsWindow();
			if (!win || BrowserWindow.fromWebContents(event.sender) !== win) return;
			if (!Number.isFinite(Number(screenX)) || !Number.isFinite(Number(screenY))) return;
			// The system's cursor, not the page's coordinates, which lag behind a moving window.
			const { x, y } = getScreen().getCursorScreenPoint();
			if (phase === "start") {
				const bounds = win.getBounds();
				recordingBarDrag = { x: x - bounds.x, y: y - bounds.y };
			} else if (phase === "move" && recordingBarDrag) {
				win.setPosition(
					Math.round(x - recordingBarDrag.x),
					Math.round(y - recordingBarDrag.y),
				);
			} else if (phase === "end") {
				recordingBarDrag = null;
			}
		},
	);

	ipcMain.on("hud-window-has-glass", (event) => {
		event.returnValue = windowHasLiquidGlass(BrowserWindow.fromWebContents(event.sender));
	});
}
