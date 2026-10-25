import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserWindow, desktopCapturer, ipcMain } from "electron";
import type { SourceListPickResult } from "../../sourceListPicker";
import {
	closeCapturePickerWindows,
	createCapturePickerWindows,
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

/** Sharp icons from macOS for each window's app, keyed by process id. */
async function sharpAppIcons(windows: CapturePickerWindow[]): Promise<Record<string, string>> {
	const pids = [...new Set(windows.map((window) => window.pid).filter(Boolean))];
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

/** Each window's app icon, as the picker's window card shows it (Screen Studio-style). */
async function withAppIcons(windows: CapturePickerWindow[]): Promise<CapturePickerWindow[]> {
	const sharp = await sharpAppIcons(windows);
	// Electron's 32 px window icons cover anything macOS has no app icon for.
	let small = new Map<string, string>();
	if (windows.some((window) => !window.pid || !sharp[window.pid])) {
		try {
			const sources = await desktopCapturer.getSources({
				types: ["window"],
				thumbnailSize: { width: 0, height: 0 },
				fetchWindowIcons: true,
			});
			small = new Map(
				sources
					.filter((source) => source.appIcon && !source.appIcon.isEmpty())
					.map((source) => [source.id, source.appIcon!.toDataURL()]),
			);
		} catch {
			// The cards show no icon.
		}
	}
	return windows.map((window) => ({
		...window,
		appIcon: (window.pid && sharp[window.pid]) || small.get(window.id),
	}));
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

	// Picker windows (one per screen) whose pointer is over a window; the bar's Window
	// icon moves while any of them is.
	const hoveringWindow = new Set<number>();
	let barHover = false;
	const broadcastWindowHover = () => {
		const hovering = hoveringWindow.size > 0;
		if (hovering === barHover) return;
		barHover = hovering;
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed())
				window.webContents.send("capture-picker-window-hover", hovering);
		}
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
		// List windows before the overlays cover them.
		pickableWindows = Promise.resolve(
			process.platform === "darwin"
				? await withAppIcons(await listCapturePickerWindows())
				: await listCapturePickerWindows(),
		);
		if (isCursorCaptureActive) return { success: false, canceled: true };
		const pick = await new Promise<CapturePick | null>((resolve) => {
			resolvePendingPick = resolve;
			// Closing an overlay without confirming cancels the pick.
			createCapturePickerWindows(() => finishPick(null));
		});
		closeCapturePickerWindows();
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
	ipcMain.handle("pick-capture-target", (_event, mode: unknown) => {
		if (isCursorCaptureActive) return { success: false, canceled: true };
		if (!activePick) {
			pickMode =
				mode === "display" || mode === "window" || mode === "area" ? mode : undefined;
			activePick = pickTarget()
				.catch((error) => {
					finishPick(null);
					closeCapturePickerWindows();
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
