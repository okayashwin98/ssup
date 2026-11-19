import { afterEach, expect, it, vi } from "vitest";
import {
	getProjectShareLink,
	moveProjectShareLink,
	removeProjectShareLinks,
	saveProjectShareLink,
} from "./projectShareLinks";
afterEach(() => vi.unstubAllGlobals());
it("retains share links across renames and clears obsolete paths", () => {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) || null,
		setItem: (key: string, value: string) => values.set(key, value),
	});
	saveProjectShareLink("old", "https://example.com/share");
	moveProjectShareLink("old", "new");
	expect(getProjectShareLink("new")).toBe("https://example.com/share");
	expect(getProjectShareLink("old")).toBeUndefined();
	removeProjectShareLinks(["new"]);
	expect(getProjectShareLink("new")).toBeUndefined();
});
it("keeps share links across a restart that empties browser storage", async () => {
	const settings = new Map<string, unknown>();
	const stubBrowser = () =>
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
	vi.stubGlobal("electronAPI", {
		getAppSetting: (key: string) => (settings.has(key) ? settings.get(key) : null),
		setAppSetting: (key: string, value: unknown) => {
			settings.set(key, structuredClone(value));
			return true;
		},
	});
	stubBrowser();
	vi.resetModules();
	const before = await import("./projectShareLinks");
	before.saveProjectShareLink("/r/A/A.ssup", "https://example.com/a");
	// A restart: fresh screens, fresh browser storage, same app settings.
	stubBrowser();
	vi.resetModules();
	const after = await import("./projectShareLinks");
	expect(after.getProjectShareLink("/r/A/A.ssup")).toBe("https://example.com/a");
});
