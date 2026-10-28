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

const { createShareSubtitles, splitLongCue } = await import("./shareSubtitles");

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

/** One token per word, 300 ms each, with "Starlight" split into two tokens as Whisper does. */
function timedCue(sentence: string) {
	const words = sentence.split(" ").flatMap((word, index) => {
		const tokens = word === "Starlight" ? ["Star", "light"] : [word];
		return tokens.map((text, part) => ({ text, leadingSpace: index > 0 && part === 0 }));
	});
	const timed = words.map((word, index) => ({
		...word,
		startMs: 1000 + index * 300,
		endMs: 1000 + index * 300 + 250,
	}));
	return {
		id: "c",
		startMs: 900,
		endMs: 1000 + timed.length * 300 + 100,
		text: sentence,
		words: timed,
	};
}

describe("long subtitles", () => {
	const sentence =
		"So here in Starlight you can change the width and the height of any Param object from the panel on the right";

	it("leave short captions alone", () => {
		const cue = timedCue("Hello Starlight");
		expect(splitLongCue(cue)).toEqual([
			{ id: "c", startMs: cue.startMs, endMs: cue.endMs, text: "Hello Starlight" },
		]);
	});

	it("are cut into back-to-back pieces of at most 42 characters, at word starts", () => {
		const cue = timedCue(sentence);
		const pieces = splitLongCue(cue);
		expect(pieces.length).toBe(3);
		expect(pieces.map((piece) => piece.text).join(" ")).toBe(sentence);
		for (const piece of pieces) expect(piece.text.length).toBeLessThanOrEqual(42);
		expect(pieces[0].startMs).toBe(cue.startMs);
		expect(pieces.at(-1)?.endMs).toBe(cue.endMs);
		pieces.slice(1).forEach((piece, index) => {
			expect(piece.startMs).toBe(pieces[index].endMs);
			const firstWord = cue.words.find(
				(word) => word.leadingSpace && piece.text.startsWith(word.text),
			);
			expect(firstWord?.startMs).toBe(piece.startMs);
		});
	});

	it("never break inside a word Whisper split into pieces", () => {
		const pieces = splitLongCue(timedCue(sentence));
		expect(pieces.some((piece) => /\bSnap\b|^trude/.test(piece.text))).toBe(false);
		expect(pieces.some((piece) => piece.text.includes("Starlight"))).toBe(true);
	});

	it("share the time by length when there is no word timing", () => {
		const pieces = splitLongCue({ id: "c", startMs: 0, endMs: 9000, text: sentence });
		expect(pieces.map((piece) => piece.text).join(" ")).toBe(sentence);
		for (const piece of pieces) expect(piece.text.length).toBeLessThanOrEqual(42);
		expect(pieces[0].startMs).toBe(0);
		expect(pieces.at(-1)?.endMs).toBe(9000);
		pieces.slice(1).forEach((piece, index) => expect(piece.startMs).toBe(pieces[index].endMs));
	});
});
