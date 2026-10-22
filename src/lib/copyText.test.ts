import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

describe("copyText", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("copies through the desktop app when it is available", async () => {
		const copyTextToClipboard = vi.fn(async () => ({ success: true }));
		const writeText = vi.fn();
		vi.stubGlobal("window", { electronAPI: { copyTextToClipboard } });
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		await copyText("https://screen.example/s/abc");
		expect(copyTextToClipboard).toHaveBeenCalledWith("https://screen.example/s/abc");
		expect(writeText).not.toHaveBeenCalled();
	});

	it("reports a failed desktop copy", async () => {
		vi.stubGlobal("window", {
			electronAPI: { copyTextToClipboard: async () => ({ success: false, error: "nope" }) },
		});
		await expect(copyText("x")).rejects.toThrow("nope");
	});

	it("falls back to the browser clipboard outside the desktop app", async () => {
		const writeText = vi.fn(async () => undefined);
		vi.stubGlobal("window", {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		await copyText("x");
		expect(writeText).toHaveBeenCalledWith("x");
	});
});
