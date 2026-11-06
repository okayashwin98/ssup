import { describe, expect, it, vi } from "vitest";

vi.mock("../paths/binaries", () => ({
	resolveUnpackedAppPath: () => "/app/std.rnnn",
	getPrebundledNativeHelperPath: () => "/app/detector",
}));
vi.mock("../ffmpeg/binary", () => ({ getFfmpegBinaryPath: () => "ffmpeg" }));
vi.mock("../captions/generate", () => ({ resolveWhisperExecutablePath: vi.fn() }));
vi.mock("../captions/whisper", () => ({ getWhisperSmallModelStatus: vi.fn() }));
vi.mock("../../appSettingsStore", () => ({ readAppSetting: vi.fn() }));

const { getCleanedAudioPath } = await import("./noiseFilter");

describe("cleaned voice files", () => {
	it("sit next to the recording, marked as the microphone, one per setting", () => {
		expect(getCleanedAudioPath("/p/recording-1.mic.m4a", { noise: 1 })).toBe(
			"/p/recording-1.mic.clean100.m4a",
		);
		expect(getCleanedAudioPath("/p/recording-1.mp4", { noise: 0.46 })).toBe(
			"/p/recording-1.mic.clean50.m4a",
		);
		expect(getCleanedAudioPath("/p/my.project/recording-1.mp4", { noise: 0.01 })).toBe(
			"/p/my.project/recording-1.mic.clean10.m4a",
		);
		expect(getCleanedAudioPath("/p/recording-1.mp4", { fillers: true })).toBe(
			"/p/recording-1.mic.nofill.m4a",
		);
		expect(getCleanedAudioPath("/p/recording-1.mic.m4a", { noise: 1, fillers: true })).toBe(
			"/p/recording-1.mic.clean100-nofill.m4a",
		);
	});
});
