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
const RECORDING_BAR_DEFAULT_SIZE = { width: 300, height: 52 };
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

/** A small non-activating panel that floats above apps, full-screen apps included. */
export function createFloatingPanel(
	bounds: Rectangle,
	options: { vibrancy: boolean; resizable?: boolean },
): BrowserWindow {
	const win = new BrowserWindow({
		...bounds,
		type: process.platform === "darwin" ? "panel" : undefined,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		...(options.vibrancy
			? { vibrancy: "hud" as const, visualEffectState: "active" as const }
			: {}),
		roundedCorners: options.vibrancy,
		hasShadow: options.vibrancy,
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
		win = createFloatingPanel(bounds, { vibrancy: true });
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
	const win = createFloatingPanel(bounds, { vibrancy: false, resizable: true });
	win.setAspectRatio(1);
	win.setMinimumSize(WEBCAM_BUBBLE_MIN_SIZE, WEBCAM_BUBBLE_MIN_SIZE);
	win.setMaximumSize(WEBCAM_BUBBLE_MAX_SIZE, WEBCAM_BUBBLE_MAX_SIZE);
	webcamBubbleWindow = win;
	applyCaptureProtection(win);
	win.once("ready-to-show", () => {
		if (alive(win)) win.showInactive();
	});
	win.on("moved", () => alive(win) && saveWebcamBubbleBounds(win));
	win.on("resized", () => alive(win) && saveWebcamBubbleBounds(win));
	win.on("closed", () => {
		if (webcamBubbleWindow === win) webcamBubbleWindow = null;
	});
	loadRendererWindow(win, "webcam-bubble");
}

function buildMenuTemplate(
	items: HudMenuItem[],
	choose: (id: string) => void,
): MenuItemConstructorOptions[] {
	return items.map((item) => {
		if (item.type === "separator") return { type: "separator" };
		if (item.type === "header") return { label: item.label ?? "", enabled: false };
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
		(event, request: { items: HudMenuItem[]; x: number; y: number }) =>
			new Promise<string | null>((resolve) => {
				const win = BrowserWindow.fromWebContents(event.sender);
				if (!win || !Array.isArray(request?.items)) {
					resolve(null);
					return;
				}
				const menu = Menu.buildFromTemplate(buildMenuTemplate(request.items, resolve));
				menu.popup({
					window: win,
					x: Math.round(request.x),
					y: Math.round(request.y),
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
}
