/** One 10 ms frame from the filler detector: chance of "um"/"uh", and of other speech. */
export type FillerFrame = { filler: number; speech: number };
export type FillerSpan = { startMs: number; endMs: number; peak: number };

export const FILLER_FRAME_MS = 10;

// The detector's own settings (Clarity FillerDetector-v3 metadata).
const ON = 0.8;
const OFF = 0.64;
const SMOOTH_FRAMES = 3;
const MERGE_GAP_FRAMES = 3;
const MIN_FRAMES = 6;
/** A filler the detector is this sure of is removed even when the transcript missed it. */
export const SURE_PEAK = 0.9;
/** How far apart a transcript "um" and a detected one may be (the transcript's timing is rough). */
export const TRANSCRIPT_MATCH_MS = 1000;

export function parseFillerFrames(csv: string): FillerFrame[] {
	return csv
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [filler, speech] = line.split(",").map(Number);
			return { filler: filler || 0, speech: speech || 0 };
		});
}

/** Fillers as the detector sees them: smoothed, with a higher bar to start than to end. */
export function detectFillerSpans(frames: FillerFrame[]): FillerSpan[] {
	const smoothed = frames.map((_, i) => {
		const near = frames.slice(Math.max(0, i - 1), i + SMOOTH_FRAMES - 1);
		return near.reduce((sum, frame) => sum + frame.filler, 0) / near.length;
	});
	const runs: Array<[number, number]> = [];
	let start = -1;
	smoothed.forEach((value, i) => {
		if (start < 0 && value >= ON) start = i;
		else if (start >= 0 && value < OFF) {
			runs.push([start, i]);
			start = -1;
		}
	});
	if (start >= 0) runs.push([start, smoothed.length]);
	const merged: Array<[number, number]> = [];
	for (const [a, b] of runs) {
		const last = merged[merged.length - 1];
		if (last && a - last[1] <= MERGE_GAP_FRAMES) last[1] = b;
		else merged.push([a, b]);
	}
	return merged
		.filter(([a, b]) => b - a >= MIN_FRAMES)
		.map(([a, b]) => ({
			startMs: a * FILLER_FRAME_MS,
			endMs: b * FILLER_FRAME_MS,
			peak: Math.max(...frames.slice(a, b).map((frame) => frame.filler)),
		}));
}

/**
 * The cross-check: a detected filler is removed when the transcript also heard a filler near
 * it, or when the detector is very sure. Without a transcript, only sure ones are removed.
 */
export function confirmFillerSpans(spans: FillerSpan[], transcriptFillerStartsMs: number[] | null) {
	return spans.filter(
		(span) =>
			span.peak >= SURE_PEAK ||
			(transcriptFillerStartsMs ?? []).some(
				(at) =>
					at >= span.startMs - TRANSCRIPT_MATCH_MS &&
					at <= span.endMs + TRANSCRIPT_MATCH_MS,
			),
	);
}

const FILLER_WORD = /^(u+m+|u+h+m*|e+r+m*|a+h+|h+m+|e+h+)$/i;

export function isFillerWord(text: string) {
	return FILLER_WORD.test(text.replace(/[^\p{L}]/gu, ""));
}

/** The quietest half second with no speech: the room's own background sound. */
export function findRoomToneFrame(frames: FillerFrame[], frameLevels: number[], lengthFrames = 50) {
	let best = -1;
	let bestLevel = Number.POSITIVE_INFINITY;
	for (let f = 0; f + lengthFrames <= Math.min(frames.length, frameLevels.length); f++) {
		let speech = 0;
		let level = 0;
		for (let i = f; i < f + lengthFrames; i++) {
			speech = Math.max(speech, frames[i].speech);
			level += frameLevels[i];
		}
		if (speech <= 0.3 && level < bestLevel) {
			bestLevel = level;
			best = f;
		}
	}
	if (best >= 0) return best;
	// No speech-free stretch: fall back to the quietest one.
	for (let f = 0; f + lengthFrames <= frameLevels.length; f++) {
		let level = 0;
		for (let i = f; i < f + lengthFrames; i++) level += frameLevels[i];
		if (level < bestLevel) {
			bestLevel = level;
			best = f;
		}
	}
	return Math.max(0, best);
}

/**
 * How much of the original sound to keep at a sample: 1 outside fillers, 0 inside, rising
 * over a short fade either side. Mixed as an equal-power crossfade with the room sound.
 */
export function makeFillerMix(
	spans: FillerSpan[],
	sampleRate: number,
	fadeMs = 40,
	padStartMs = 20,
	padEndMs = 30,
) {
	const ranges = spans.map((span) => ({
		start: Math.round(((span.startMs - padStartMs) * sampleRate) / 1000),
		end: Math.round(((span.endMs + padEndMs) * sampleRate) / 1000),
	}));
	const fade = Math.max(1, Math.round((fadeMs * sampleRate) / 1000));
	let cursor = 0;
	return (sample: number) => {
		while (cursor < ranges.length && sample >= ranges[cursor].end + fade) cursor++;
		let lowest = 1;
		for (let r = cursor; r < ranges.length && ranges[r].start - fade <= sample; r++) {
			const { start, end } = ranges[r];
			const x =
				sample < start
					? (start - sample) / fade
					: sample >= end
						? (sample - end) / fade
						: 0;
			lowest = Math.min(lowest, Math.min(1, x));
		}
		return lowest;
	};
}
