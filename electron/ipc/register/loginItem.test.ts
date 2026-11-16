import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	app: { isPackaged: true, getLoginItemSettings: vi.fn(), setLoginItemSettings: vi.fn() },
}));
vi.mock("electron", () => ({
	app: mocks.app,
	ipcMain: {
		handle: (key: string, handler: (...args: unknown[]) => unknown) =>
			mocks.handlers.set(key, handler),
	},
}));

import { registerLoginItemHandlers } from "./loginItem";

const platform = process.platform;
let openAtLogin = false;
const get = () => mocks.handlers.get("get-open-at-login")!();
const set = (value: unknown) => mocks.handlers.get("set-open-at-login")!({}, value);

beforeEach(() => {
	vi.clearAllMocks();
	Object.defineProperty(process, "platform", { value: "darwin" });
	mocks.app.isPackaged = true;
	openAtLogin = false;
	mocks.app.getLoginItemSettings.mockImplementation(() => ({ openAtLogin }));
	mocks.app.setLoginItemSettings.mockImplementation((settings: { openAtLogin: boolean }) => {
		openAtLogin = settings.openAtLogin;
	});
	mocks.handlers.clear();
	registerLoginItemHandlers();
});
afterEach(() => Object.defineProperty(process, "platform", { value: platform }));

it("reads the system's login item, so a change made in System Settings shows", () => {
	expect(get()).toEqual({ success: true, supported: true, available: true, openAtLogin: false });
	openAtLogin = true;
	expect(get()).toMatchObject({ openAtLogin: true });
});

it("turns open at login on and off in the installed app, reporting the system's answer", () => {
	expect(set(true)).toMatchObject({ success: true, openAtLogin: true });
	expect(mocks.app.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true });
	expect(set(false)).toMatchObject({ success: true, openAtLogin: false });
	expect(mocks.app.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false });
});

it("never registers a login item in development, where it would be Electron itself", () => {
	mocks.app.isPackaged = false;
	expect(get()).toEqual({ success: true, supported: true, available: false, openAtLogin: false });
	expect(set(true)).toMatchObject({ success: false, available: false });
	expect(mocks.app.setLoginItemSettings).not.toHaveBeenCalled();
	expect(mocks.app.getLoginItemSettings).not.toHaveBeenCalled();
});

it("is unsupported on Linux and refuses anything but true or false", () => {
	expect(set("yes")).toMatchObject({ success: false });
	Object.defineProperty(process, "platform", { value: "linux" });
	expect(get()).toMatchObject({ supported: false, available: false, openAtLogin: false });
	expect(set(true)).toMatchObject({ success: false });
	expect(mocks.app.setLoginItemSettings).not.toHaveBeenCalled();
});

it("reports a system error instead of throwing", () => {
	mocks.app.setLoginItemSettings.mockImplementation(() => {
		throw new Error("denied");
	});
	expect(set(true)).toMatchObject({ success: false, error: "Error: denied" });
});
