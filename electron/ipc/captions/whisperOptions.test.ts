import { describe, expect, it } from "vitest";
import { isUnsupportedWhisperOption, shouldRetryWhisperWithoutJson } from "./parser";

describe("recognising options an older Whisper rejects", () => {
	it("spots the full-JSON and glossary-repeat options in either spelling", () => {
		expect(shouldRetryWhisperWithoutJson(new Error("error: unknown argument: -ojf"))).toBe(
			true,
		);
		expect(shouldRetryWhisperWithoutJson("unrecognized option '--output-json-full'")).toBe(
			true,
		);
		expect(
			isUnsupportedWhisperOption(
				new Error("error: unknown argument: --carry-initial-prompt"),
				["carry-initial-prompt"],
			),
		).toBe(true);
	});

	it("ignores other failures and other options", () => {
		expect(shouldRetryWhisperWithoutJson(new Error("failed to load model"))).toBe(false);
		expect(shouldRetryWhisperWithoutJson("unknown argument: -ojfx")).toBe(false);
		expect(
			isUnsupportedWhisperOption("unknown argument: --prompt", ["carry-initial-prompt"]),
		).toBe(false);
	});
});
