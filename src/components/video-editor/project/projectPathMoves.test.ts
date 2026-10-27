import { afterEach, expect, it, vi } from "vitest";
import { getProjectShareLink, saveProjectShareLink } from "../cloud/projectShareLinks";
import { followProjectPathMoves } from "./projectPathMoves";

afterEach(() => vi.unstubAllGlobals());
it("keeps folder membership and share links on moved projects, and leaves folders alone otherwise", () => {
	const values = new Map<string, string>();
	const setItem = vi.fn((key: string, value: string) => values.set(key, value));
	const dispatchEvent = vi.fn();
	vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) || null, setItem });
	vi.stubGlobal("window", { dispatchEvent });
	vi.stubGlobal(
		"CustomEvent",
		class {
			constructor(
				public type: string,
				public init: unknown,
			) {}
		},
	);
	const old = "/r/Projects/Demo.recordly";
	const next = "/r/Demo/Demo.ssup";
	values.set(
		"recordly.project-folders.v1",
		JSON.stringify([
			{ id: "f", name: "Work", color: "#929292", paths: [old, "/r/Other/Other.ssup"] },
		]),
	);
	saveProjectShareLink(old, "https://example.com/share");

	followProjectPathMoves({ [old]: next });

	expect(JSON.parse(values.get("recordly.project-folders.v1") as string)[0].paths).toEqual([
		next,
		"/r/Other/Other.ssup",
	]);
	expect(getProjectShareLink(next)).toBe("https://example.com/share");
	expect(getProjectShareLink(old)).toBeUndefined();
	// Following again changes nothing and does not refresh the folders.
	setItem.mockClear();
	dispatchEvent.mockClear();
	followProjectPathMoves({ [old]: next });
	expect(setItem).not.toHaveBeenCalled();
	expect(dispatchEvent).not.toHaveBeenCalled();
});
