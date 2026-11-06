import {
	CAPTION_GLOSSARY_SETTING,
	normalizeCaptionGlossary,
} from "../../../src/lib/captionGlossary";
import { readAppSetting } from "../../appSettingsStore";
import { generateAutoCaptionsFromVideo } from "../captions/generate";
import { buildCaptionTextFromWords } from "../captions/parser";
import { getWhisperSmallModelStatus } from "../captions/whisper";
import type { CaptionCuePayload, CaptionWordPayload } from "../types";

export type ShareSubtitleSegment = { startTime: number; endTime: number; text: string };

/** Netflix's line length: longer captions are cut into pieces that each show on their own. */
const MAX_CAPTION_CHARS = 42;

/**
 * Cuts items into the fewest pieces that fit the limit, as even in length as possible
 * (least squared difference from the average), so no piece is left with a stray word.
 */
function splitEvenly<T>(items: T[], length: (items: T[]) => number): T[][] {
	let pieces = Math.ceil(length(items) / MAX_CAPTION_CHARS);
	if (pieces <= 1) return [items];
	for (; pieces <= items.length; pieces++) {
		const target = length(items) / pieces;
		// best[k][i]: lowest cost for the first i items in k pieces; cut[k][i]: where the last piece starts.
		const best = Array.from({ length: pieces + 1 }, () =>
			Array(items.length + 1).fill(Infinity),
		);
		const cut = Array.from({ length: pieces + 1 }, () => Array(items.length + 1).fill(0));
		best[0][0] = 0;
		for (let k = 1; k <= pieces; k++) {
			for (let i = k; i <= items.length; i++) {
				for (let start = k - 1; start < i; start++) {
					if (best[k - 1][start] === Infinity) continue;
					const size = length(items.slice(start, i));
					// A single word longer than the limit still gets its own piece.
					if (size > MAX_CAPTION_CHARS && i - start > 1) continue;
					const cost = best[k - 1][start] + (size - target) ** 2;
					if (cost < best[k][i]) {
						best[k][i] = cost;
						cut[k][i] = start;
					}
				}
			}
		}
		if (best[pieces][items.length] === Infinity) continue;
		const groups: T[][] = [];
		for (let k = pieces, end = items.length; k > 0; k--) {
			const start = cut[k][end];
			groups.unshift(items.slice(start, end));
			end = start;
		}
		return groups;
	}
	return items.map((item) => [item]);
}

/** Cuts a long cue at word boundaries; each piece shows from its first word until the next piece. */
export function splitLongCue(cue: CaptionCuePayload): CaptionCuePayload[] {
	const tokens = cue.words ?? [];
	if (tokens.length === 0) {
		// No word timing: share the cue's time out by text length.
		const groups = splitEvenly(cue.text.trim().split(/\s+/), (words) => words.join(" ").length);
		const total = groups.reduce((sum, group) => sum + group.join(" ").length, 0) || 1;
		let cursor = cue.startMs;
		return groups.map((group, index) => {
			const text = group.join(" ");
			const startMs = cursor;
			cursor =
				index === groups.length - 1
					? cue.endMs
					: Math.round(startMs + ((cue.endMs - cue.startMs) * text.length) / total);
			return { id: cue.id, startMs, endMs: cursor, text };
		});
	}
	// Whisper splits some words into several tokens; only break where a space starts a word.
	const words: CaptionWordPayload[][] = [];
	tokens.forEach((token, index) => {
		if (index === 0 || token.leadingSpace) words.push([token]);
		else words[words.length - 1].push(token);
	});
	const textOf = (group: CaptionWordPayload[][]) => {
		const flat = group.flat();
		return buildCaptionTextFromWords(
			flat.map((token, i) => (i === 0 ? { ...token, leadingSpace: false } : token)),
		);
	};
	const groups = splitEvenly(words, (group) => textOf(group).length);
	return groups.map((group, index) => ({
		id: cue.id,
		startMs: index === 0 ? cue.startMs : group[0][0].startMs,
		endMs: index === groups.length - 1 ? cue.endMs : groups[index + 1][0][0].startMs,
		text: textOf(group),
	}));
}

/** Cuts long subtitles that have no word timing, such as captions from the editor. */
export function splitLongSegments(segments: ShareSubtitleSegment[]): ShareSubtitleSegment[] {
	return segments.flatMap((segment) =>
		splitLongCue({
			id: "",
			startMs: segment.startTime * 1000,
			endMs: segment.endTime * 1000,
			text: segment.text,
		}).map((cue) => ({
			startTime: cue.startMs / 1000,
			endTime: cue.endMs / 1000,
			text: cue.text,
		})),
	);
}

/**
 * Transcribes the exact file being shared, so the timing already matches the
 * edited video. Returns null when there is no speech model or no audio.
 */
export async function createShareSubtitles(
	videoPath: string,
): Promise<ShareSubtitleSegment[] | null> {
	const model = await getWhisperSmallModelStatus();
	if (!model.exists || !model.path) return null;
	try {
		const { cues } = await generateAutoCaptionsFromVideo({
			videoPath,
			whisperModelPath: model.path,
			prompt: normalizeCaptionGlossary(readAppSetting(CAPTION_GLOSSARY_SETTING)),
		});
		const segments = cues
			.flatMap(splitLongCue)
			.map((cue) => ({
				startTime: cue.startMs / 1000,
				endTime: cue.endMs / 1000,
				text: cue.text.trim(),
			}))
			.filter((segment) => segment.text && segment.endTime > segment.startTime);
		return segments.length ? segments : null;
	} catch (error) {
		console.warn("Share subtitles skipped:", error);
		return null;
	}
}
