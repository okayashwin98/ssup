import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	list: vi.fn(),
	pickSourceList: vi.fn(),
	validate: vi.fn(),

	selected: vi.fn(),
	recording: false,
	currentSource: null as Record<string, unknown> | null,
	create: vi.fn(),
	close: vi.fn(),
	overlay: {},
	outsider: {},
	windows: [] as object[],
	listeners: new Map<string, (...args: unknown[]) => unknown>(),
	sent: [] as unknown[][],
	pickerSent: [] as unknown[][],
	hud: { webContents: { send: (...args: unknown[]) => mocks.sent.push(args) } },
	iconRuns: [] as string[][],
}));
vi.mock("electron", () => ({
	ipcMain: {
		handle: (name: string, handler: (...args: unknown[]) => unknown) =>
			mocks.handlers.set(name, handler),
		on: (name: string, listener: (...args: unknown[]) => unknown) =>
			mocks.listeners.set(name, listener),
	},
}));
vi.mock("node:child_process", () => ({
	execFile: (
		_file: string,
		args: string[],
		_options: unknown,
		callback: (error: Error | null, result: { stdout: string }) => void,
	) => {
		mocks.iconRuns.push(args);
		const icons = Object.fromEntries(args.slice(1).map((pid) => [pid, `icon-of-${pid}`]));
		callback(null, { stdout: JSON.stringify(icons) });
	},
}));
vi.mock("../paths/binaries", () => ({
	ensureAppIconsBinary: async () => "/helpers/recordly-app-icons",
	ensureWindowResizeBinary: async () => "/helpers/recordly-window-resize",
}));
vi.mock("../../windows", () => ({
	createCapturePickerWindows: mocks.create,
	closeCapturePickerWindows: mocks.close,
	isCapturePickerWebContents: (sender: object) => mocks.windows.includes(sender),
	getHudOverlayWindow: () => mocks.hud,
}));
vi.mock("../captureSelection", () => ({
	validateCaptureSource: mocks.validate,
}));
vi.mock("../capturePickerSources", () => ({ listCapturePickerWindows: mocks.list }));
vi.mock("../cursor/bounds", () => ({ stopWindowBoundsCapture: vi.fn() }));
vi.mock("../state", () => ({
	setSelectedSource: mocks.selected,
	get isCursorCaptureActive() {
		return mocks.recording;
	},
	get selectedSource() {
		return mocks.currentSource;
	},
}));
vi.mock("../utils", () => ({
	getScreen: () => ({
		getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 1000 } }],
		getPrimaryDisplay: () => ({ id: 1 }),
		getCursorScreenPoint: () => ({ x: 0, y: 0 }),
	}),
}));
vi.mock("./sources", () => ({
	bringSelectedWindowForward: vi.fn(),
	broadcastSelectedSourceChange: vi.fn(),
	getDesktopSources: vi.fn().mockResolvedValue([{ id: "screen:1:0", display_id: "1" }]),
}));

import { registerCapturePickerHandlers } from "./capturePicker";

const platform = process.platform;
afterEach(() => {
	Object.defineProperty(process, "platform", { value: platform });
	vi.unstubAllEnvs();
});
beforeEach(() => {
	vi.clearAllMocks();
	mocks.handlers.clear();
	mocks.listeners.clear();
	mocks.sent = [];
	mocks.currentSource = null;
	mocks.recording = false;
	mocks.windows = [mocks.overlay];
	Object.defineProperty(process, "platform", { value: "darwin" });
	mocks.list.mockResolvedValue([]);
	mocks.validate.mockImplementation(async (source) => source);
	registerCapturePickerHandlers({ pickSourceList: mocks.pickSourceList });
});
const call = (name: string, sender: object, input?: unknown) =>
	mocks.handlers.get(name)!({ sender }, input);
describe("picker signals and app icons", () => {
	const picker = {
		isDestroyed: () => false,
		webContents: { send: (...args: unknown[]) => mocks.pickerSent.push(args) },
	};
	const notes = {
		id: "window:101:0",
		title: "Launch checklist",
		appName: "Notes",
		pid: 4242,
		x: 0,
		y: 0,
		width: 600,
		height: 400,
	};

	it("opens before icons load, sends them to the picker, and reuses them next time", async () => {
		mocks.pickerSent = [];
		mocks.iconRuns = [];
		mocks.create.mockReturnValue([picker]);
		mocks.list.mockImplementation(async () => [{ ...notes }]);
		const first = call("pick-capture-target", mocks.outsider);
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		await vi.waitFor(() =>
			expect(mocks.pickerSent).toEqual([
				["capture-picker-icons", { "window:101:0": "icon-of-4242" }],
			]),
		);
		await call("complete-capture-pick", mocks.overlay, null);
		await first;

		const second = call("pick-capture-target", mocks.outsider);
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
		const context = (await call("get-capture-picker-context", mocks.overlay, 1)) as {
			windows: { appIcon?: string }[];
		};
		expect(context.windows[0]?.appIcon).toBe("icon-of-4242");
		expect(mocks.iconRuns).toHaveLength(1);
		await call("complete-capture-pick", mocks.overlay, null);
		await second;
	});

	it("takes mode switches only from the bar, and sends them only to the picker", async () => {
		mocks.pickerSent = [];
		mocks.create.mockReturnValue([picker]);
		const pending = call("pick-capture-target", mocks.outsider, "display");
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		const setMode = (sender: object, mode: string) =>
			mocks.listeners.get("capture-picker-set-mode")!({ sender }, mode);
		setMode(mocks.outsider, "area");
		setMode(mocks.hud.webContents, "window");
		expect(mocks.pickerSent).toEqual([["capture-picker-mode-changed", "window"]]);
		expect(mocks.sent).toEqual([]);
		await call("complete-capture-pick", mocks.overlay, null);
		await pending;
	});
});

describe("window hover for the bar's Window icon", () => {
	it("is on while any screen's picker hovers a window, and off when the picker closes", async () => {
		const second = { id: 2 };
		Object.assign(mocks.overlay, { id: 1 });
		mocks.windows = [mocks.overlay, second];
		const hover = (sender: object, hovering: boolean) =>
			mocks.listeners.get("capture-picker-window-hover")!({ sender }, hovering);
		const pending = call("pick-capture-target", mocks.outsider);
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		hover(mocks.overlay, true);
		hover(second, true);
		hover(mocks.overlay, false);
		hover(mocks.outsider, false); // not a picker: ignored
		expect(mocks.sent).toEqual([["capture-picker-window-hover", true]]);
		await call("complete-capture-pick", mocks.overlay, null);
		await pending;
		expect(mocks.sent).toEqual([
			["capture-picker-window-hover", true],
			["capture-picker-window-hover", false],
		]);
	});
});

describe("selection-only picker IPC", () => {
	it("ignores completion from other windows and passes Start recording through", async () => {
		const pending = call("pick-capture-target", mocks.outsider);
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		await call("complete-capture-pick", mocks.outsider, {
			kind: "screen",
			displayId: 1,
			record: true,
		});
		expect(mocks.selected).not.toHaveBeenCalled();
		await call("complete-capture-pick", mocks.overlay, {
			kind: "screen",
			displayId: 1,
			record: true,
		});
		expect(await pending).toMatchObject({
			success: true,
			source: { id: "screen:1:0" },
			record: true,
		});
	});
	it("coalesces simultaneous opens into one picker", async () => {
		const first = call("pick-capture-target", mocks.outsider);
		const second = call("pick-capture-target", mocks.outsider);
		await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		await call("complete-capture-pick", mocks.overlay, null);
		expect(await first).toEqual({ success: false, canceled: true });
		expect(await second).toEqual({ success: false, canceled: true });
	});
	it("keeps Wayland on the existing portal path without overlays or geometry probes", async () => {
		Object.defineProperty(process, "platform", { value: "linux" });
		vi.stubEnv("XDG_SESSION_TYPE", "wayland");
		expect(await call("pick-capture-target", mocks.outsider)).toMatchObject({
			success: true,
			source: { id: "screen:linux-portal" },
		});
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.list).not.toHaveBeenCalled();
	});
});

it("rejects a window that disappeared while the picker was open", async () => {
	mocks.list.mockResolvedValue([
		{
			id: "window:101:0",
			title: "Document",
			appName: "Notes",
			x: 0,
			y: 0,
			width: 400,
			height: 300,
		},
	]);
	mocks.validate.mockResolvedValue(null);
	const pending = call("pick-capture-target", mocks.outsider);
	await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
	await call("complete-capture-pick", mocks.overlay, {
		kind: "window",
		windowId: "window:101:0",
		displayId: 1,
	});
	expect(await pending).toMatchObject({
		success: false,
		message: "That window or screen is no longer available.",
	});
	expect(mocks.selected).not.toHaveBeenCalled();
});
it("surfaces detection failures instead of opening a screen-only overlay", async () => {
	mocks.list.mockRejectedValue(new Error("Unable to detect windows"));
	expect(await call("pick-capture-target", mocks.outsider)).toMatchObject({
		success: false,
		message: "Unable to detect windows",
	});
	expect(mocks.create).not.toHaveBeenCalled();
	expect(mocks.selected).not.toHaveBeenCalled();
});

it("opens a fresh picker even when an area is already selected", async () => {
	mocks.currentSource = {
		id: "area:1",
		display_id: "1",
		area: { x: 100, y: 200, width: 400, height: 300 },
	};
	expect(await call("get-capture-picker-context", mocks.overlay, 1)).toMatchObject({
		lastArea: null,
	});
	mocks.currentSource = { id: "window:101:0", display_id: "1" };
	expect(await call("get-capture-picker-context", mocks.overlay, 1)).toMatchObject({
		lastArea: null,
	});
});

it("does not open any source picker during recording or pause", async () => {
	mocks.recording = true;
	expect(await call("pick-capture-target", mocks.outsider)).toEqual({
		success: false,
		canceled: true,
	});
	expect(mocks.list).not.toHaveBeenCalled();
	expect(mocks.create).not.toHaveBeenCalled();
	expect(mocks.selected).not.toHaveBeenCalled();
});

it("rejects a pending selection if recording starts while the picker is open", async () => {
	const pending = call("pick-capture-target", mocks.outsider);
	await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
	mocks.recording = true;
	await call("complete-capture-pick", mocks.overlay, { kind: "screen", displayId: 1 });
	expect(await pending).toEqual({ success: false, canceled: true });
	expect(mocks.selected).not.toHaveBeenCalled();
});

it("does not open overlays if recording starts while listing windows", async () => {
	mocks.list.mockImplementation(async () => {
		mocks.recording = true;
		return [];
	});
	expect(await call("pick-capture-target", mocks.outsider)).toEqual({
		success: false,
		canceled: true,
	});
	expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps X11 on the source list and coalesces concurrent opens", async () => {
	Object.defineProperty(process, "platform", { value: "linux" });
	vi.stubEnv("XDG_SESSION_TYPE", "x11");
	let finish!: (result: unknown) => void;
	mocks.pickSourceList.mockReturnValue(
		new Promise((resolve) => {
			finish = resolve;
		}),
	);
	const first = call("pick-capture-target", mocks.outsider);
	const second = call("pick-capture-target", mocks.outsider);
	expect(mocks.pickSourceList).toHaveBeenCalledOnce();
	expect(mocks.list).not.toHaveBeenCalled();
	expect(mocks.create).not.toHaveBeenCalled();
	finish({ success: false, canceled: true });
	expect(await first).toEqual({ success: false, canceled: true });
	expect(await second).toEqual({ success: false, canceled: true });
});
it("keeps the X11 source list closed during recording", async () => {
	Object.defineProperty(process, "platform", { value: "linux" });
	vi.stubEnv("XDG_SESSION_TYPE", "x11");
	mocks.recording = true;
	expect(await call("pick-capture-target", mocks.outsider)).toEqual({
		success: false,
		canceled: true,
	});
	expect(mocks.pickSourceList).not.toHaveBeenCalled();
});
