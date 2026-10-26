import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type BrowserWindow, desktopCapturer, ipcMain } from "electron";
import type { SourceListPickResult } from "../../sourceListPicker";
import {
	closeCapturePickerWindows,
	createCapturePickerWindows,
	getHudOverlayWindow,
	isCapturePickerWebContents,
} from "../../windows";
import { listCapturePickerWindows } from "../capturePickerSources";
import { validateCaptureSource } from "../captureSelection";
import { stopWindowBoundsCapture } from "../cursor/bounds";
import { ensureAppIconsBinary, ensureWindowResizeBinary } from "../paths/binaries";
import { createAreaSource, createWindowSource, normalizeCapturePick } from "../sourceArea";
import { isCursorCaptureActive, setSelectedSource } from "../state";
import type { CapturePick, CapturePickerMode, CapturePickerWindow, SelectedSource } from "../types";
import { getScreen } from "../utils";
import { getScreenSourceIdForDisplay, isLikelyLinuxWaylandSession } from "./sourceMapping";
import { broadcastSelectedSourceChange, getDesktopSources } from "./sources";

const run = promisify(execFile);

// The window card shows icons at 80 pt, so 160 px keeps them sharp on Retina screens.
const APP_ICON_PIXELS = 160;

/** Sharp icons from macOS for these processes, keyed by process id. */
async function sharpAppIcons(pids: number[]): Promise<Record<string, string>> {
	if (process.platform !== "darwin" || pids.length === 0) return {};
	try {
		const { stdout } = await run(
			await ensureAppIconsBinary(),
			[String(APP_ICON_PIXELS), ...pids.map(String)],
			{ timeout: 3000, maxBuffer: 16 * 1024 * 1024 },
		);
		return JSON.parse(stdout);
	} catch {
		return {};
	}
}

/** Electron's 32 px window icons, for windows macOS has no app icon for. */
async function smallWindowIcons(): Promise<Map<string, string>> {
	try {
		const sources = await desktopCapturer.getSources({
			types: ["window"],
			thumbnailSize: { width: 0, height: 0 },
			fetchWindowIcons: true,
		});
		return new Map(
			sources
				.filter((source) => source.appIcon && !source.appIcon.isEmpty())
				.map((source) => [source.id, source.appIcon!.toDataURL()]),
		);
	} catch {
		return new Map();
	}
}

// App icons by app (process id and name, so a reused id is not mistaken for another
// app), kept between picks so the window cards have them at once.
const appIconCache = new Map<string, string>();
const appIconKey = (window: CapturePickerWindow) => `${window.pid}:${window.appName}`;

/** Gives each window the icon already known for its app, forgetting apps now gone. */
function applyCachedAppIcons(windows: CapturePickerWindow[]) {
	const open = new Set(windows.map(appIconKey));
	for (const key of appIconCache.keys()) {
		if (!open.has(key)) appIconCache.delete(key);
	}
	for (const window of windows) {
		const icon = window.pid ? appIconCache.get(appIconKey(window)) : undefined;
		if (icon) window.appIcon = icon;
	}
}

/**
 * Fetches the icons still missing, after the picker is already showing, and returns
 * the ones it found by window id.
 */
async function fetchMissingAppIcons(
	windows: CapturePickerWindow[],
): Promise<Record<string, string>> {
	const missing = windows.filter((window) => !window.appIcon);
	if (missing.length === 0) return {};
	const pids = [
		...new Set(missing.map((window) => window.pid).filter((pid) => pid !== undefined)),
	];
	const sharp = await sharpAppIcons(pids as number[]);
	const found: Record<string, string> = {};
	for (const window of missing) {
		const icon = window.pid ? sharp[window.pid] : undefined;
		if (!icon) continue;
		appIconCache.set(appIconKey(window), icon);
		window.appIcon = icon;
		found[window.id] = icon;
	}
	if (missing.some((window) => !window.appIcon)) {
		const small = await smallWindowIcons();
		for (const window of missing) {
			const icon = window.appIcon ? undefined : small.get(window.id);
			if (!icon) continue;
			window.appIcon = icon;
			found[window.id] = icon;
		}
	}
	return found;
}

/** The same source the screen list offers for this display. */
async function createScreenSource(displayId: number): Promise<SelectedSource | null> {
	const displays = getScreen().getAllDisplays();
	const index = displays.findIndex((display) => display.id === displayId);
	if (index < 0) return null;
	const sources = await getDesktopSources(
		{
			types: ["screen"],
			thumbnailSize: { width: 0, height: 0 },
		},
		{ strict: true },
	);
	const matched =
		sources.find((source) => source.display_id === String(displayId)) ??
		(sources.length === displays.length ? sources[index] : undefined);
	const isPrimary = getScreen().getPrimaryDisplay().id === displayId;
	return {
		id: getScreenSourceIdForDisplay({
			displayId: String(displayId),
			platform: process.platform,
			matchedSourceId: matched?.id,
		}),
		name: isPrimary ? `Screen ${index + 1} (Primary)` : `Screen ${index + 1}`,
		display_id: String(displayId),
		sourceType: "screen",
	};
}

/**
 * The capture picker covers every display: hovering highlights the window under
 * the cursor, a click picks that window or the whole screen, and a drag draws an
 * area. The pick becomes the selected source.
 */
export function registerCapturePickerHandlers({
	pickSourceList,
}: {
	pickSourceList: () => Promise<SourceListPickResult>;
}) {
	let resolvePendingPick: ((pick: CapturePick | null) => void) | null = null;
	let pickableWindows: Promise<CapturePickerWindow[]> = Promise.resolve([]);

	const finishPick = (pick: CapturePick | null) => {
		const resolve = resolvePendingPick;
		resolvePendingPick = null;
		resolve?.(pick);
	};

	// The open picker's windows, one per screen.
	let pickerWindows: BrowserWindow[] = [];
	const sendToPickers = (channel: string, payload: unknown) => {
		for (const window of pickerWindows) {
			if (!window.isDestroyed()) window.webContents.send(channel, payload);
		}
	};
	const isHudSender = (sender: Electron.WebContents) =>
		getHudOverlayWindow()?.webContents === sender;

	// Picker windows whose pointer is over a window; the bar's Window icon moves while
	// any of them is.
	const hoveringWindow = new Set<number>();
	let barHover = false;
	const broadcastWindowHover = () => {
		const hovering = hoveringWindow.size > 0;
		if (hovering === barHover) return;
		barHover = hovering;
		getHudOverlayWindow()?.webContents.send("capture-picker-window-hover", hovering);
	};
	ipcMain.on("capture-picker-window-hover", (event, hovering: unknown) => {
		if (!isCapturePickerWebContents(event.sender)) return;
		if (hovering === true) hoveringWindow.add(event.sender.id);
		else hoveringWindow.delete(event.sender.id);
		broadcastWindowHover();
	});

	let activePick: Promise<unknown> | null = null;
	let pickMode: CapturePickerMode | undefined;
	const pickTarget = async () => {
		if (isCursorCaptureActive) return { success: false, canceled: true };
		if (process.platform === "linux" && isLikelyLinuxWaylandSession(process.env)) {
			// Preserve the existing portal recording path: its system picker opens
			// when recording starts; overlay selection cannot identify Wayland windows.
			const source = {
				id: "screen:linux-portal",
				name: "System picker",
				sourceType: "screen" as const,
			};
			setSelectedSource(source);
			broadcastSelectedSourceChange();
			return {
				success: true,
				source,
				message: "Choose a screen or window in the system picker when you start recording.",
			};
		}

		if (process.platform === "linux") return pickSourceList();

		finishPick(null);
		// List windows before the overlays cover them. Icons known from earlier picks
		// come at once; the rest arrive while the picker is already showing.
		const windows = await listCapturePickerWindows();
		if (process.platform === "darwin") applyCachedAppIcons(windows);
		pickableWindows = Promise.resolve(windows);
		if (isCursorCaptureActive) return { success: false, canceled: true };
		const pick = await new Promise<CapturePick | null>((resolve) => {
			resolvePendingPick = resolve;
			// Closing an overlay without confirming cancels the pick.
			pickerWindows = createCapturePickerWindows(() => finishPick(null)) ?? [];
			if (process.platform === "darwin") {
				void fetchMissingAppIcons(windows).then((icons) => {
					if (Object.keys(icons).length > 0) sendToPickers("capture-picker-icons", icons);
				});
			}
		});
		closeCapturePickerWindows();
		pickerWindows = [];
		hoveringWindow.clear();
		broadcastWindowHover();
		if (!pick || isCursorCaptureActive) {
			return { success: false, canceled: true };
		}

		let source: SelectedSource | null;
		if (pick.kind === "area") {
			source = createAreaSource(pick);
		} else if (pick.kind === "window") {
			const window = (await pickableWindows).find((entry) => entry.id === pick.windowId);
			source = window ? createWindowSource(window) : null;
		} else {
			source = await createScreenSource(pick.displayId);
		}
		if (source) source = await validateCaptureSource(source);
		if (!source) {
			return { success: false, message: "That window or screen is no longer available." };
		}

		if (isCursorCaptureActive) return { success: false, canceled: true };
		// Recording brings the selected window forward; selection need not wait for it.
		setSelectedSource(source);
		broadcastSelectedSourceChange();
		stopWindowBoundsCapture();
		// "Start recording" on the picked window, screen or area starts it straight away.
		return { success: true, source, record: pick.record === true };
	};
	// The bar's Display, Window and Area buttons switch an open picker's mode in place.
	// Clicking the bar can give it the keyboard; its keys come back to the picker
	// under the pointer, so Escape and Enter keep working there.
	const focusPickerUnderPointer = () => {
		const cursor = getScreen().getCursorScreenPoint();
		const under = pickerWindows.find((window) => {
			if (window.isDestroyed()) return false;
			const { x, y, width, height } = window.getBounds();
			return cursor.x >= x && cursor.x < x + width && cursor.y >= y && cursor.y < y + height;
		});
		(under ?? pickerWindows.find((window) => !window.isDestroyed()))?.focus();
	};
	ipcMain.on("capture-picker-set-mode", (event, mode: unknown) => {
		if (!isHudSender(event.sender)) return;
		if (!activePick || (mode !== "display" && mode !== "window" && mode !== "area")) return;
		pickMode = mode;
		sendToPickers("capture-picker-mode-changed", mode);
		focusPickerUnderPointer();
	});
	// Escape pressed while the bar has the keyboard closes the picker.
	ipcMain.on("capture-picker-cancel", (event) => {
		if (isHudSender(event.sender)) finishPick(null);
	});
	ipcMain.handle("pick-capture-target", (_event, mode: unknown) => {
		if (isCursorCaptureActive) return { success: false, canceled: true };
		if (!activePick) {
			pickMode =
				mode === "display" || mode === "window" || mode === "area" ? mode : undefined;
			activePick = pickTarget()
				.catch((error) => {
					finishPick(null);
					closeCapturePickerWindows();
					pickerWindows = [];
					hoveringWindow.clear();
					broadcastWindowHover();
					return {
						success: false,
						message:
							error instanceof Error
								? error.message
								: "Unable to open the source picker.",
					};
				})
				.finally(() => {
					activePick = null;
				});
		}
		return activePick;
	});

	ipcMain.handle("complete-capture-pick", async (event, input: unknown) => {
		if (!isCapturePickerWebContents(event.sender)) return;
		if (
			input &&
			typeof input === "object" &&
			(input as { kind?: unknown }).kind === "area" &&
			process.platform !== "darwin"
		)
			return;
		if (!input || isCursorCaptureActive) {
			finishPick(null);
			return;
		}
		const displays = getScreen()
			.getAllDisplays()
			.map((display) => ({ id: display.id, bounds: display.bounds }));
		finishPick(normalizeCapturePick(input, displays, await pickableWindows));
	});

	ipcMain.handle("get-capture-picker-context", async (event, displayId: unknown) => {
		if (!isCapturePickerWebContents(event.sender)) throw new Error("Unknown picker window.");
		const display = getScreen()
			.getAllDisplays()
			.find((entry) => entry.id === Number(displayId));
		if (!display) {
			return {
				displayBounds: null,
				lastArea: null,
				allowArea: process.platform === "darwin",
				mode: pickMode,
				windows: [],
				cursor: null,
			};
		}
		const { x, y, width, height } = display.bounds;
		const windows = (await pickableWindows).filter(
			(window) =>
				window.x < x + width &&
				window.x + window.width > x &&
				window.y < y + height &&
				window.y + window.height > y,
		);
		return {
			displayBounds: display.bounds,
			allowArea: process.platform === "darwin",
			mode: pickMode,
			displayName: display.label || undefined,
			refreshRate: display.displayFrequency || undefined,
			lastArea: null,
			windows,
			cursor: getScreen().getCursorScreenPoint(),
		};
	});

	// Screen Studio's Resize presets: the real window takes the chosen size.
	ipcMain.handle(
		"capture-picker-resize-window",
		async (event, windowId: unknown, size: { width?: unknown; height?: unknown }) => {
			if (!isCapturePickerWebContents(event.sender))
				throw new Error("Unknown picker window.");
			if (process.platform !== "darwin") return { success: false };
			const width = Math.round(Number(size?.width));
			const height = Math.round(Number(size?.height));
			const windows = await pickableWindows;
			const target = windows.find((window) => window.id === windowId);
			if (!target?.pid || !(width >= 100 && height >= 100)) return { success: false };
			try {
				const { stdout } = await run(
					await ensureWindowResizeBinary(),
					[
						JSON.stringify({
							pid: target.pid,
							x: target.x,
							y: target.y,
							width: target.width,
							height: target.height,
							newWidth: width,
							newHeight: height,
						}),
					],
					{ timeout: 5000 },
				);
				const frame = JSON.parse(stdout);
				Object.assign(target, {
					x: Math.round(frame.x),
					y: Math.round(frame.y),
					width: Math.round(frame.width),
					height: Math.round(frame.height),
				});
				return {
					success: true,
					frame: { x: target.x, y: target.y, width: target.width, height: target.height },
				};
			} catch (error) {
				const message =
					(error as { stderr?: string }).stderr?.trim() ||
					"This window cannot be resized.";
				return { success: false, message };
			}
		},
	);
}
