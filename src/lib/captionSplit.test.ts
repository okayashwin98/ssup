import { describe, expect, it } from "vitest";
import { MAX_CAPTION_CHARS, splitLongCue } from "./captionSplit";

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
	return { startMs: 900, endMs: 1000 + timed.length * 300 + 100, text: sentence, words: timed };
}

const sentence =
	"So here in Starlight you can change the width and the height of any Param object from the panel on the right";

describe("splitLongCue", () => {
	it("leaves short captions alone", () => {
		const cue = timedCue("Hello Starlight");
		expect(splitLongCue(cue)).toEqual([
			{ startMs: cue.startMs, endMs: cue.endMs, text: "Hello Starlight" },
		]);
	});

	it("cuts long captions into back-to-back, even pieces at word starts", () => {
		const cue = timedCue(sentence);
		const pieces = splitLongCue(cue);
		expect(pieces.map((piece) => piece.text)).toEqual([
			"So here in Starlight you can change",
			"the width and the height of any Param",
			"object from the panel on the right",
		]);
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

	it("shares the time by length when there is no word timing", () => {
		const pieces = splitLongCue({ startMs: 0, endMs: 9000, text: sentence });
		expect(pieces.map((piece) => piece.text).join(" ")).toBe(sentence);
		for (const piece of pieces)
			expect(piece.text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
		expect(pieces[0].startMs).toBe(0);
		expect(pieces.at(-1)?.endMs).toBe(9000);
		pieces.slice(1).forEach((piece, index) => expect(piece.startMs).toBe(pieces[index].endMs));
	});

	it("stays fast on the longest captions the editor allows", () => {
		const text = Array.from({ length: 340 }, (_, i) => `word${i % 10}`).join(" ");
		const started = performance.now();
		const pieces = splitLongCue({ startMs: 0, endMs: 120000, text });
		expect(performance.now() - started).toBeLessThan(100);
		expect(pieces.map((piece) => piece.text).join(" ")).toBe(text);
		for (const piece of pieces)
			expect(piece.text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
	});
});
