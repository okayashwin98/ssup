import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	status: vi.fn(),
	ask: vi.fn(),
	sources: vi.fn(),
	open: vi.fn(),
	accessory: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: {
		handle: (key: string, handler: (...args: unknown[]) => unknown) =>
			mocks.handlers.set(key, handler),
	},
	desktopCapturer: { getSources: mocks.sources },
	systemPreferences: { getMediaAccessStatus: mocks.status, askForMediaAccess: mocks.ask },
	shell: { openExternal: mocks.open },
}));
vi.mock("../utils", () => ({ getMacPrivacySettingsUrl: (pane: string) => `settings:${pane}` }));
vi.mock("./permissionAccessory", () => ({
	showPermissionAccessory: mocks.accessory,
	startPermissionAccessoryDrag: vi.fn(),
	dismissPermissionAccessory: vi.fn(),
}));
import { registerPermissionHandlers } from "./permissions";
const platform = process.platform;
afterEach(() => Object.defineProperty(process, "platform", { value: platform }));
beforeEach(() => {
	vi.resetAllMocks();
	Object.defineProperty(process, "platform", { value: "darwin" });
	mocks.handlers.clear();
	registerPermissionHandlers();
});
it("does not prompt or open settings merely by registering permission handlers", () => {
	expect(mocks.sources).not.toHaveBeenCalled();
	expect(mocks.open).not.toHaveBeenCalled();
});
it("registers first-time Screen Recording access before opening its settings", async () => {
	mocks.status.mockReturnValue("not-determined");
	mocks.sources.mockResolvedValue([]);
	expect(await mocks.handlers.get("open-screen-recording-preferences")!()).toEqual({
		success: true,
	});
	expect(mocks.sources).toHaveBeenCalledWith({
		types: ["screen"],
		thumbnailSize: { width: 0, height: 0 },
	});
	expect(mocks.sources.mock.invocationCallOrder[0]).toBeLessThan(
		mocks.open.mock.invocationCallOrder[0],
	);
	expect(mocks.open).toHaveBeenCalledWith("settings:screen");
});
it("opens settings even when the first-time capture request is rejected", async () => {
	mocks.status.mockReturnValue("not-determined");
	mocks.sources.mockRejectedValue(new Error("Denied"));
	expect(await mocks.handlers.get("open-screen-recording-preferences")!()).toEqual({
		success: true,
	});
	expect(mocks.open).toHaveBeenCalledWith("settings:screen");
});
it("does not enumerate screens for an already determined permission", async () => {
	mocks.status.mockReturnValue("denied");
	await mocks.handlers.get("open-screen-recording-preferences")!();
	expect(mocks.sources).not.toHaveBeenCalled();
	expect(mocks.open).toHaveBeenCalledWith("settings:screen");
});
it("leaves native macOS permission controls unused on other platforms", async () => {
	Object.defineProperty(process, "platform", { value: "win32" });
	expect(await mocks.handlers.get("open-screen-recording-preferences")!()).toEqual({
		success: true,
	});
	expect(mocks.sources).not.toHaveBeenCalled();
	expect(mocks.open).not.toHaveBeenCalled();
});
it.each([
	["not-determined", true, true],
	["not-determined", false, true],
	["granted", true, false],
	["denied", false, false],
	["restricted", false, false],
] as const)("camera access %s: prompts only while undecided", async (status, granted, prompts) => {
	mocks.status.mockReturnValue(status);
	mocks.ask.mockResolvedValue(granted);
	expect(await mocks.handlers.get("request-media-permission")!({}, "camera")).toEqual({
		success: true,
		granted,
	});
	expect(mocks.ask).toHaveBeenCalledTimes(prompts ? 1 : 0);
});
it("reads camera and microphone access without prompting", async () => {
	mocks.status.mockImplementation((device: string) =>
		device === "camera" ? "denied" : "granted",
	);
	expect(await mocks.handlers.get("get-media-permission-status")!()).toEqual({
		success: true,
		camera: "denied",
		microphone: "granted",
	});
	expect(mocks.ask).not.toHaveBeenCalled();
});
it("opens the Camera and Microphone pages of System Settings, and nothing else", async () => {
	await mocks.handlers.get("open-media-permission-preferences")!({}, "camera");
	await mocks.handlers.get("open-media-permission-preferences")!({}, "microphone");
	expect(
		(await mocks.handlers.get("open-media-permission-preferences")!({}, "screen")) as {
			success: boolean;
		},
	).toMatchObject({ success: false });
	expect(mocks.open.mock.calls).toEqual([["settings:camera"], ["settings:microphone"]]);
});
it("the drag helper opens the permission's page, then shows SuperShare's icon beside it", async () => {
	const sender = {};
	expect(
		await mocks.handlers.get("show-permission-drag-helper")!({ sender }, "accessibility"),
	).toEqual({ success: true });
	expect(mocks.open).toHaveBeenCalledWith("settings:accessibility");
	expect(mocks.accessory).toHaveBeenCalledWith("accessibility", sender);
	expect(mocks.open.mock.invocationCallOrder[0]).toBeLessThan(
		mocks.accessory.mock.invocationCallOrder[0],
	);
});
it("System Settings stays open when the drag helper cannot start", async () => {
	mocks.accessory.mockRejectedValue(new Error("no helper"));
	expect(
		await mocks.handlers.get("show-permission-drag-helper")!({ sender: {} }, "screen"),
	).toEqual({ success: true });
	expect(mocks.open).toHaveBeenCalledWith("settings:screen");
	expect(await mocks.handlers.get("show-permission-drag-helper")!({}, "camera")).toMatchObject({
		success: false,
	});
});
