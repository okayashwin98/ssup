import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadProjectFolders,
	moveProjectFolderReferences,
	saveProjectFolders,
} from "./useProjectFolders";

/** Browser storage that a restart wipes, and an app-settings store that survives it. */
function fakeApp() {
	const settings = new Map<string, unknown>();
	let browser = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => browser.get(key) ?? null,
		setItem: (key: string, value: string) => browser.set(key, value),
	});
	vi.stubGlobal("electronAPI", {
		getAppSetting: (key: string) => (settings.has(key) ? settings.get(key) : null),
		setAppSetting: (key: string, value: unknown) => {
			settings.set(key, structuredClone(value));
			return true;
		},
	});
	vi.stubGlobal("window", { dispatchEvent: () => true });
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(
				public type: string,
				public init?: unknown,
			) {}
		},
	);
	return {
		restart: () => {
			browser = new Map();
		},
	};
}

const folder = { id: "f1", name: "Loom", color: "#929292", paths: ["/r/A/A.ssup"] };

describe("project folders", () => {
	let app: ReturnType<typeof fakeApp>;
	beforeEach(() => {
		app = fakeApp();
	});
	afterEach(() => vi.unstubAllGlobals());

	it("survive a restart that empties browser storage", () => {
		expect(saveProjectFolders([folder])).toBe(true);
		app.restart();
		expect(loadProjectFolders()).toEqual([folder]);
	});

	it("follow a renamed project across a restart", () => {
		saveProjectFolders([folder]);
		app.restart();
		moveProjectFolderReferences("/r/A/A.ssup", "/r/B/B.ssup");
		app.restart();
		expect(loadProjectFolders()[0].paths).toEqual(["/r/B/B.ssup"]);
	});
});
