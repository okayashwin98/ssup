import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
	const { EventEmitter } = await import("node:events");
	return {
		spawn: vi.fn(),
		binary: vi.fn(),
		screen: vi.fn(),
		accessibility: vi.fn(),
		iconPath: vi.fn(),
		app: Object.assign(new EventEmitter(), { getPath: vi.fn() }),
		window: Object.assign(new EventEmitter(), {
			isDestroyed: vi.fn(() => false),
			hide: vi.fn(),
			destroy: vi.fn(),
			showInactive: vi.fn(),
			setBounds: vi.fn(),
			setVisibleOnAllWorkspaces: vi.fn(),
			loadURL: vi.fn(async () => undefined),
			loadFile: vi.fn(async () => undefined),
			webContents: Object.assign(new EventEmitter(), {
				setWindowOpenHandler: vi.fn(),
				startDrag: vi.fn(),
			}),
		}),
		icon: { isEmpty: () => false, resize: vi.fn(() => "supershare-drag-icon") },
		owner: Object.assign(new EventEmitter(), {
			isDestroyed: vi.fn(),
			show: vi.fn(),
			focus: vi.fn(),
		}),
	};
});
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../paths/binaries", () => ({ ensurePermissionDragHelperBinary: mocks.binary }));
vi.mock("electron", () => ({
	app: mocks.app,
	BrowserWindow: Object.assign(
		vi.fn(function () {
			return mocks.window;
		}),
		{ fromWebContents: () => mocks.owner },
	),
	nativeImage: {
		createFromPath: (file: string) => {
			mocks.iconPath(file);
			return mocks.icon;
		},
	},
	systemPreferences: {
		getMediaAccessStatus: mocks.screen,
		isTrustedAccessibilityClient: mocks.accessibility,
	},
}));

import type { WebContents } from "electron";
import {
	ACCESSORY_SIZE,
	closePermissionAccessory,
	dismissPermissionAccessory,
	runningApplicationBundle,
	showPermissionAccessory,
	startPermissionAccessoryDrag,
} from "./permissionAccessory";

const platform = process.platform;
const devServer = process.env.VITE_DEV_SERVER_URL;
let child: EventEmitter & {
	stdin: PassThrough;
	stdout: PassThrough;
	stderr: PassThrough;
	kill: ReturnType<typeof vi.fn>;
};
let sender: WebContents;
beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	Object.defineProperty(process, "platform", { value: "darwin" });
	process.env.VITE_DEV_SERVER_URL = "http://localhost:5173/";
	mocks.app.getPath.mockReturnValue("/Applications/SuperShare.app/Contents/MacOS/SuperShare");
	mocks.owner.isDestroyed.mockReturnValue(false);
	mocks.screen.mockReturnValue("denied");
	mocks.accessibility.mockReturnValue(false);
	mocks.binary.mockResolvedValue("/bundled/supershare-permission-drag-helper");
	child = Object.assign(new EventEmitter(), {
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: vi.fn(),
	});
	mocks.spawn.mockReturnValue(child);
	sender = Object.assign(new EventEmitter(), {
		isDestroyed: () => false,
	}) as unknown as WebContents;
});
afterEach(() => {
	closePermissionAccessory();
	child.emit("exit", 0);
	vi.useRealTimers();
	Object.defineProperty(process, "platform", { value: platform });
	process.env.VITE_DEV_SERVER_URL = devServer;
});

async function launch(permission: "screen" | "accessibility" = "accessibility") {
	const pending = showPermissionAccessory(permission, sender);
	await vi.advanceTimersByTimeAsync(0);
	child.stdout.write("rea");
	child.stdout.write("dy\n");
	await pending;
}

const helperArgs = (bundle: string, permission: string) => [
	"--app-bundle",
	bundle,
	"--permission",
	permission,
	"--width",
	String(ACCESSORY_SIZE.width),
	"--height",
	String(ACCESSORY_SIZE.height),
	"--parent-pid",
	String(process.pid),
];

it("only takes a top-level app from its Contents/MacOS executable", () => {
	expect(runningApplicationBundle("/Applications/SuperShare.app/Contents/MacOS/SuperShare")).toBe(
		"/Applications/SuperShare.app",
	);
	expect(runningApplicationBundle("/tmp/SuperShare")).toBeUndefined();
	expect(
		runningApplicationBundle("/Applications/SuperShare.app/elsewhere/SuperShare"),
	).toBeUndefined();
});

it("shows nothing on other platforms or once access is allowed", async () => {
	Object.defineProperty(process, "platform", { value: "win32" });
	await showPermissionAccessory("screen", sender);
	Object.defineProperty(process, "platform", { value: "darwin" });
	mocks.screen.mockReturnValue("granted");
	await showPermissionAccessory("screen", sender);
	expect(mocks.spawn).not.toHaveBeenCalled();
	expect(mocks.binary).not.toHaveBeenCalled();
});

it("hands over the running app: a test copy drags itself, not the installed SuperShare", async () => {
	mocks.app.getPath.mockReturnValue(
		"/Users/me/SuperShareTest-build/SuperShare Test.app/Contents/MacOS/SuperShare Test",
	);
	await launch("screen");
	expect(mocks.spawn).toHaveBeenCalledWith(
		"/bundled/supershare-permission-drag-helper",
		helperArgs("/Users/me/SuperShareTest-build/SuperShare Test.app", "screen"),
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
});

it("in development drags the running Electron app", async () => {
	mocks.app.getPath.mockReturnValue(
		"/work/recordly/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
	);
	await launch();
	expect(mocks.spawn).toHaveBeenCalledWith(
		"/bundled/supershare-permission-drag-helper",
		helperArgs("/work/recordly/node_modules/electron/dist/Electron.app", "accessibility"),
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
});

it("closes and returns to SuperShare once access is allowed", async () => {
	await launch();
	await vi.advanceTimersByTimeAsync(1000);
	expect(child.stdin.writableEnded).toBe(false);
	mocks.accessibility.mockReturnValue(true);
	await vi.advanceTimersByTimeAsync(500);
	expect(child.stdin.read()?.toString()).toBe("close\n");
	expect(mocks.owner.focus).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(2000);
	expect(child.kill).toHaveBeenCalledOnce();
});

it("shows the window only after it paints, where the helper places it", async () => {
	await launch();
	expect(mocks.window.loadURL).toHaveBeenCalledWith(
		"http://localhost:5173/?windowType=permission-accessory&permission=accessibility",
	);
	const { width, height } = ACCESSORY_SIZE;
	child.stdout.write(`{"visible":true,"x":120,"y":400,"width":${width},"height":${height}}\n`);
	expect(mocks.window.showInactive).not.toHaveBeenCalled();
	mocks.window.emit("ready-to-show");
	expect(mocks.window.showInactive).toHaveBeenCalledOnce();
	expect(mocks.window.setBounds).toHaveBeenCalledWith({ x: 120, y: 400, width, height });
	child.stdout.write('{"visible":true,"x":1,"y":1,"width":999,"height":999}\n');
	expect(mocks.window.setBounds).toHaveBeenCalledOnce();
	child.stdout.write('{"visible":false}\n');
	expect(mocks.window.hide).toHaveBeenCalledOnce();
});

it("only the helper window drags, and it drags the running app with SuperShare's icon", async () => {
	await launch();
	expect(startPermissionAccessoryDrag(sender)).toEqual({ success: false });
	expect(
		startPermissionAccessoryDrag(mocks.window.webContents as unknown as WebContents),
	).toEqual({ success: true });
	expect(mocks.window.webContents.startDrag).toHaveBeenCalledWith({
		file: "/Applications/SuperShare.app",
		icon: "supershare-drag-icon",
	});
	expect(mocks.iconPath).toHaveBeenCalledWith(expect.stringMatching(/recordlymac-128\.png$/));
	expect(dismissPermissionAccessory(sender)).toEqual({ success: false });
	expect(dismissPermissionAccessory(mocks.window.webContents as unknown as WebContents)).toEqual({
		success: true,
	});
	expect(mocks.owner.focus).toHaveBeenCalledOnce();
});

it("a helper still being prepared when cancelled never opens", async () => {
	let ready!: (value: string) => void;
	mocks.binary.mockReturnValue(
		new Promise<string>((resolve) => {
			ready = resolve;
		}),
	);
	const pending = showPermissionAccessory("screen", sender);
	closePermissionAccessory();
	ready("/bundled/helper");
	await pending;
	expect(mocks.spawn).not.toHaveBeenCalled();
});

it("reports a helper that fails to start and stops watching", async () => {
	const pending = showPermissionAccessory("screen", sender);
	const result = expect(pending).rejects.toThrow("helper failed");
	await vi.advanceTimersByTimeAsync(0);
	child.stderr.write("helper failed");
	child.emit("exit", 2);
	await result;
	expect(mocks.owner.listenerCount("closed")).toBe(0);
	await vi.advanceTimersByTimeAsync(10_000);
	expect(child.kill).not.toHaveBeenCalled();
});
