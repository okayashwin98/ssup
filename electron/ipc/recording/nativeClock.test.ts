import { describe, expect, it } from "vitest";
import { parseNativeResumeVideoMs, resolveCursorCaptureStartMs } from "./nativeClock";

describe("native capture clock alignment", () => {
	it("reads the video time the helper reports on resume", () => {
		expect(parseNativeResumeVideoMs("Recording paused\nRecording resumed at 0.253\n")).toBe(
			253,
		);
		expect(parseNativeResumeVideoMs("Recording resumed\n")).toBeNull();
	});

	it("starts cursor time where the video's time zero was", () => {
		// Resumed 400 ms ago at video time 253 ms: video zero was 653 ms ago.
		expect(resolveCursorCaptureStartMs({ wallMs: 10_000, videoMs: 253 }, 10_400)).toBe(9_747);
		expect(resolveCursorCaptureStartMs({ wallMs: 10_000, videoMs: 0 }, 10_050)).toBe(10_000);
	});

	it("falls back to now without a fresh anchor", () => {
		expect(resolveCursorCaptureStartMs(null, 5_000)).toBe(5_000);
		expect(resolveCursorCaptureStartMs({ wallMs: 1_000, videoMs: 0 }, 60_000)).toBe(60_000);
	});
});
