import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, nativeImage, systemPreferences, type WebContents } from "electron";
import { ensurePermissionDragHelperBinary } from "../paths/binaries";

/**
 * "Drag SuperShare into the list": a small window under System Settings holding the
 * app's icon, which drags the running app's bundle into Screen Recording or
 * Accessibility. The native helper only reports where System Settings' window is.
 */
export type AccessoryPermission = "screen" | "accessibility";

// The window holds the card plus room for its shadow; the helper places it this size.
export const ACCESSORY_SIZE = { width: 320, height: 196 };

const electronDir = path.dirname(fileURLToPath(import.meta.url));

let active:
	| { close: () => void; window: BrowserWindow; bundle: string; owner: BrowserWindow }
	| undefined;
let generation = 0;

/** The running app's bundle, from its own executable; renderer paths are never accepted. */
export function runningApplicationBundle(executable: string): string | undefined {
	const bundle = path.dirname(path.dirname(path.dirname(executable)));
	return bundle.endsWith(".app") &&
		path.dirname(executable) === path.join(bundle, "Contents", "MacOS")
		? bundle
		: undefined;
}

function granted(permission: AccessoryPermission): boolean {
	return permission === "screen"
		? systemPreferences.getMediaAccessStatus("screen") === "granted"
		: systemPreferences.isTrustedAccessibilityClient(false);
}

function rendererTarget(
	permission: AccessoryPermission,
): { url: string } | { file: string; query: Record<string, string> } {
	const query = { windowType: "permission-accessory", permission };
	const devServer = process.env.VITE_DEV_SERVER_URL;
	if (devServer) {
		const url = new URL(devServer);
		url.search = new URLSearchParams(query).toString();
		return { url: url.toString() };
	}
	return { file: path.join(electronDir, "..", "dist", "index.html"), query };
}

/** SuperShare's Mac icon, the same art as the app bundle's. */
function dragIcon() {
	const assets = process.env.VITE_PUBLIC || path.join(electronDir, "..", "dist");
	return nativeImage.createFromPath(path.join(assets, "app-icons", "recordlymac-128.png"));
}

export function closePermissionAccessory() {
	generation++;
	active?.close();
}

/** Only the helper window may start the drag, and only of the running app's bundle. */
export function startPermissionAccessoryDrag(sender: WebContents) {
	if (!active || active.window.isDestroyed() || active.window.webContents !== sender)
		return { success: false };
	const icon = dragIcon();
	if (icon.isEmpty()) return { success: false };
	sender.startDrag({ file: active.bundle, icon: icon.resize({ width: 64, height: 64 }) });
	return { success: true };
}

export function dismissPermissionAccessory(sender: WebContents) {
	if (!active || active.window.isDestroyed() || active.window.webContents !== sender)
		return { success: false };
	const owner = active.owner;
	closePermissionAccessory();
	if (!owner.isDestroyed()) {
		owner.show();
		owner.focus();
	}
	return { success: true };
}

/**
 * Shows the helper beside System Settings until access is allowed, System Settings
 * closes, the user goes back, or five minutes pass. Does nothing once access is allowed.
 */
export async function showPermissionAccessory(
	permission: AccessoryPermission,
	sender?: WebContents,
) {
	if (process.platform !== "darwin" || !sender || sender.isDestroyed()) return;
	const bundle = runningApplicationBundle(app.getPath("exe"));
	if (!bundle || granted(permission)) return;
	closePermissionAccessory();
	const request = generation;
	const binary = await ensurePermissionDragHelperBinary();
	if (request !== generation || sender.isDestroyed() || granted(permission)) return;
	const owner = BrowserWindow.fromWebContents(sender);
	if (!owner || owner.isDestroyed()) return;
	const { width, height } = ACCESSORY_SIZE;
	const accessory = new BrowserWindow({
		width,
		height,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		resizable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		focusable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		type: "panel",
		webPreferences: {
			preload: path.join(electronDir, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	accessory.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	accessory.webContents.on("will-navigate", (event) => event.preventDefault());
	accessory.setVisibleOnAllWorkspaces(true, {
		visibleOnFullScreen: true,
		// As the other panels: changing the app's process type races the Dock icon.
		skipTransformProcessType: true,
	});
	let loaded = false;
	let shouldShow = false;
	accessory.once("ready-to-show", () => {
		loaded = true;
		if (shouldShow) accessory.showInactive();
	});
	const target = rendererTarget(permission);
	const loading =
		"url" in target
			? accessory.loadURL(target.url)
			: accessory.loadFile(target.file, { query: target.query });
	void loading.catch(() => {
		if (!accessory.isDestroyed()) accessory.destroy();
	});
	const child = spawn(
		binary,
		[
			"--app-bundle",
			bundle,
			"--permission",
			permission,
			"--width",
			String(width),
			"--height",
			String(height),
			"--parent-pid",
			String(process.pid),
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	await followSettings(child, permission, sender, owner, accessory, bundle, (frame) => {
		if (accessory.isDestroyed()) return;
		if (!frame.visible) {
			shouldShow = false;
			accessory.hide();
			return;
		}
		if (
			![frame.x, frame.y].every(Number.isInteger) ||
			frame.width !== width ||
			frame.height !== height
		)
			return;
		accessory.setBounds({ x: frame.x as number, y: frame.y as number, width, height });
		shouldShow = true;
		if (loaded) accessory.showInactive();
	});
}

type AccessoryFrame = { visible: boolean; x?: number; y?: number; width?: number; height?: number };

function followSettings(
	child: ChildProcessWithoutNullStreams,
	permission: AccessoryPermission,
	sender: WebContents,
	owner: BrowserWindow,
	accessory: BrowserWindow,
	bundle: string,
	onFrame: (frame: AccessoryFrame) => void,
) {
	return new Promise<void>((resolve, reject) => {
		let ready = false;
		let finished = false;
		let closing = false;
		let stdout = "";
		let stderr = "";
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const returnToOwner = () => {
			if (!owner.isDestroyed()) {
				owner.show();
				owner.focus();
			}
		};
		const cleanup = () => {
			if (finished) return;
			finished = true;
			clearInterval(poll);
			clearTimeout(startup);
			clearTimeout(lifetime);
			if (killTimer) clearTimeout(killTimer);
			owner.removeListener("closed", close);
			sender.removeListener("destroyed", close);
			sender.removeListener("did-start-navigation", close);
			app.removeListener("before-quit", close);
			accessory.removeListener("closed", close);
			if (!accessory.isDestroyed()) accessory.destroy();
			if (active?.close === close) active = undefined;
		};
		const close = () => {
			if (finished || closing) return;
			closing = true;
			if (!accessory.isDestroyed()) accessory.hide();
			clearInterval(poll);
			clearTimeout(startup);
			clearTimeout(lifetime);
			child.stdin.end("close\n");
			killTimer = setTimeout(() => child.kill(), 1000);
			killTimer.unref();
		};
		const startup = setTimeout(() => {
			reject(new Error("Permission drag helper did not start"));
			close();
		}, 5000);
		const lifetime = setTimeout(close, 5 * 60_000);
		// Access turned on: close the helper and bring SuperShare back.
		const poll = setInterval(() => {
			try {
				if (!granted(permission)) return;
				close();
				returnToOwner();
			} catch {
				close();
			}
		}, 500);
		poll.unref();
		lifetime.unref();
		startup.unref();
		active = { close, window: accessory, bundle, owner };
		accessory.once("closed", close);
		owner.once("closed", close);
		sender.once("destroyed", close);
		sender.once("did-start-navigation", close);
		app.once("before-quit", close);
		// The helper can exit while access is being checked; stop on a broken pipe.
		child.stdin.on("error", close);
		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
			for (let newline = stdout.indexOf("\n"); newline >= 0; newline = stdout.indexOf("\n")) {
				const event = stdout.slice(0, newline).trim();
				stdout = stdout.slice(newline + 1);
				if (event === "ready" && !ready) {
					ready = true;
					clearTimeout(startup);
					resolve();
				}
				if (event.startsWith("{")) {
					try {
						onFrame(JSON.parse(event) as AccessoryFrame);
					} catch {
						/* Ignore malformed helper output. */
					}
				}
			}
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr = (stderr + data.toString()).slice(-2048);
		});
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("exit", (code) => {
			cleanup();
			if (!ready)
				reject(
					new Error(stderr || `Permission drag helper exited before opening (${code})`),
				);
		});
	});
}
