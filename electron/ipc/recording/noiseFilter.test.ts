import { describe, expect, it, vi } from "vitest";

vi.mock("../paths/binaries", () => ({ resolveUnpackedAppPath: () => "/app/std.rnnn" }));
vi.mock("../ffmpeg/binary", () => ({ getFfmpegBinaryPath: () => "ffmpeg" }));

const { getCleanedAudioPath } = await import("./noiseFilter");

describe("cleaned voice files", () => {
	it("sit next to the recording, marked as the microphone, one per strength", () => {
		expect(getCleanedAudioPath("/p/recording-1.mic.m4a", 1)).toBe(
			"/p/recording-1.mic.clean100.m4a",
		);
		expect(getCleanedAudioPath("/p/recording-1.mp4", 0.46)).toBe(
			"/p/recording-1.mic.clean50.m4a",
		);
		expect(getCleanedAudioPath("/p/my.project/recording-1.mp4", 0.01)).toBe(
			"/p/my.project/recording-1.mic.clean10.m4a",
		);
	});
});
