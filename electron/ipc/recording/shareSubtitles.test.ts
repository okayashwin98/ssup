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

const { createShareSubtitles, fitShareSubtitleLimit, MAX_SHARE_SUBTITLES } = await import(
	"./shareSubtitles"
);

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

describe("share subtitle limit", () => {
	it("joins neighbours in pairs only when there are too many", () => {
		const make = (count: number) =>
			Array.from({ length: count }, (_, i) => ({
				startTime: i,
				endTime: i + 1,
				text: `w${i}`,
			}));
		expect(fitShareSubtitleLimit(make(10))).toHaveLength(10);
		const fitted = fitShareSubtitleLimit(make(MAX_SHARE_SUBTITLES + 3));
		expect(fitted.length).toBeLessThanOrEqual(MAX_SHARE_SUBTITLES);
		expect(fitted[0]).toEqual({ startTime: 0, endTime: 2, text: "w0 w1" });
		expect(fitted.at(-1)?.endTime).toBe(MAX_SHARE_SUBTITLES + 3);
		expect(fitted.map((s) => s.text).join(" ")).toBe(
			make(MAX_SHARE_SUBTITLES + 3)
				.map((s) => s.text)
				.join(" "),
		);
	});
});
