import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	generate: vi.fn(async () => ({
		cues: [{ id: "1", startMs: 0, endMs: 1000, text: "Hello Starlight" }],
	})),
	setting: vi.fn((): unknown => null),
}));
vi.mock("../captions/generate", () => ({ generateAutoCaptionsFromVideo: mocks.generate }));
vi.mock("../captions/whisper", () => ({
	getWhisperSmallModelStatus: async () => ({ exists: true, path: "/model.bin" }),
}));
vi.mock("../../appSettingsStore", () => ({ readAppSetting: mocks.setting }));

const { createShareSubtitles } = await import("./shareSubtitles");

describe("shared-link subtitles", () => {
	beforeEach(() => mocks.generate.mockClear());

	it("use the app-wide caption glossary", async () => {
		mocks.setting.mockReturnValue("Starlight, SuperShare");
		await createShareSubtitles("/video.mp4");
		expect(mocks.setting).toHaveBeenCalledWith("supershare.captionGlossary");
		expect(mocks.generate).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: "Starlight, SuperShare" }),
		);
	});

	it("work without a glossary", async () => {
		mocks.setting.mockReturnValue(null);
		expect(await createShareSubtitles("/video.mp4")).toEqual([
			{ startTime: 0, endTime: 1, text: "Hello Starlight" },
		]);
		expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: "" }));
	});
});
