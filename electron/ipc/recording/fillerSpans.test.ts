import { describe, expect, it } from "vitest";
import {
	confirmFillerSpans,
	detectFillerSpans,
	findRoomToneFrame,
	isFillerWord,
	makeFillerMix,
	parseFillerFrames,
} from "./fillerSpans";

const frames = (values: number[], speech = 0.9) => values.map((filler) => ({ filler, speech }));

describe("filler spans", () => {
	it("needs a strong start, keeps going while fairly sure, and drops blips", () => {
		const spans = detectFillerSpans(
			frames([
				0, 0, 0.95, 0.95, 0.9, 0.9, 0.8, 0.75, 0.7, 0.7, 0.7, 0.1, 0, 0, 0.99, 0.99, 0, 0,
			]),
		);
		// Smoothed over 3 frames: on at frame 3, off at frame 10; the 2-frame blip never starts.
		expect(spans).toEqual([{ startMs: 30, endMs: 100, peak: 0.95 }]);
	});

	it("keeps sure fillers, and others only when the transcript heard one nearby", () => {
		const sure = { startMs: 1000, endMs: 1300, peak: 0.95 };
		const unsure = { startMs: 5000, endMs: 5300, peak: 0.85 };
		expect(confirmFillerSpans([sure, unsure], null)).toEqual([sure]);
		expect(confirmFillerSpans([sure, unsure], [5900])).toEqual([sure, unsure]);
		expect(confirmFillerSpans([sure, unsure], [7000])).toEqual([sure]);
	});

	it("reads the detector's lines and recognises filler words", () => {
		expect(parseFillerFrames("0.5,0.2\n0.1,0.9\n")).toEqual([
			{ filler: 0.5, speech: 0.2 },
			{ filler: 0.1, speech: 0.9 },
		]);
		expect(["Um,", "uh.", "Hmm", "erm", "umbrella", "huh", "like"].map(isFillerWord)).toEqual([
			true,
			true,
			true,
			true,
			false,
			false,
			false,
		]);
	});

	it("takes the room sound from the quietest stretch without speech", () => {
		const f = frames(new Array(200).fill(0), 0.9).map((frame, i) => ({
			...frame,
			speech: i >= 100 && i < 160 ? 0.05 : 0.9,
		}));
		const levels = new Array(200)
			.fill(0.001)
			.map((level, i) => (i >= 100 && i < 160 ? 0.01 : level));
		expect(findRoomToneFrame(f, levels)).toBeGreaterThanOrEqual(100);
		expect(findRoomToneFrame(f, levels)).toBeLessThanOrEqual(110);
	});

	it("fades the voice out round a filler and back in after it", () => {
		const mix = makeFillerMix([{ startMs: 1000, endMs: 1200, peak: 1 }], 1000, 40, 20, 30);
		expect(mix(900)).toBe(1);
		expect(mix(960)).toBeCloseTo(0.5);
		expect(mix(1000)).toBe(0);
		expect(mix(1229)).toBe(0);
		expect(mix(1250)).toBeCloseTo(0.5);
		expect(mix(1300)).toBe(1);
	});
});
