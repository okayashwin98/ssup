import { splitLongCue } from "@/lib/captionSplit";
import {
	type CaptionCue,
	type ClipRegion,
	getClipSourceEndMs,
	getClipSourceStartMs,
	sortClipRegions,
} from "./types";

export function captionSpanToSource(clip: ClipRegion, span: { start: number; end: number }) {
	const sourceTime = (time: number) =>
		Math.round(
			getClipSourceStartMs(clip) +
				(Math.max(clip.startMs, Math.min(clip.endMs, time)) - clip.startMs) * clip.speed,
		);
	return { startMs: sourceTime(span.start), endMs: sourceTime(span.end) };
}

export function projectCaptionCues(cues: CaptionCue[], clips: ClipRegion[]) {
	return sortClipRegions(clips).flatMap((clip) => {
		const sourceStart = getClipSourceStartMs(clip);
		const sourceEnd = getClipSourceEndMs(clip);
		return cues.flatMap((cue) => {
			const start = Math.max(cue.startMs, sourceStart);
			const end = Math.min(cue.endMs, sourceEnd);
			if (start >= end) return [];
			return [
				{
					...cue,
					id: JSON.stringify([cue.id, clip.id]),
					sourceCueId: cue.id,
					sourceCue: cue,
					clip,
					startMs: clip.startMs + (start - sourceStart) / clip.speed,
					endMs: clip.startMs + (end - sourceStart) / clip.speed,
				},
			];
		});
	});
}

export function retimeCaptionFragment(
	fragment: ReturnType<typeof projectCaptionCues>[number],
	span: { start: number; end: number },
) {
	const mapped = captionSpanToSource(fragment.clip, span);
	// An unchanged clipped edge must not truncate the rest of the source cue.
	return {
		startMs: span.start === fragment.startMs ? fragment.sourceCue.startMs : mapped.startMs,
		endMs: span.end === fragment.endMs ? fragment.sourceCue.endMs : mapped.endMs,
	};
}

const joinWords = (words: NonNullable<CaptionCue["words"]>) =>
	words
		.map((word, index) => `${index > 0 && word.leadingSpace ? " " : ""}${word.text}`)
		.join("")
		.replace(/\s+/g, " ")
		.trim();

/**
 * The captions as subtitles for an exported or shared video: on the edited timeline, with long
 * cues cut into short pieces. Word timings are used while they still match the cue's text.
 */
export function buildSubtitleCues(cues: CaptionCue[], clips: ClipRegion[]) {
	return projectCaptionCues(cues, clips)
		.filter(
			(cue) =>
				Number.isFinite(cue.startMs) &&
				Number.isFinite(cue.endMs) &&
				cue.endMs > cue.startMs &&
				typeof cue.text === "string" &&
				cue.text.trim().length > 0,
		)
		.flatMap((cue) => {
			const sourceStart = getClipSourceStartMs(cue.clip);
			const sourceEnd = getClipSourceEndMs(cue.clip);
			const toTimeline = (ms: number) =>
				cue.clip.startMs + (ms - sourceStart) / cue.clip.speed;
			const words = cue.words ?? [];
			const wordsMatchText =
				words.length > 0 && joinWords(words) === cue.text.replace(/\s+/g, " ").trim();
			const visibleWords = wordsMatchText
				? words
						.filter((word) => word.startMs >= sourceStart && word.startMs < sourceEnd)
						.map((word) => ({
							...word,
							startMs: toTimeline(word.startMs),
							endMs: toTimeline(word.endMs),
						}))
				: [];
			const text = visibleWords.length ? joinWords(visibleWords) : cue.text;
			return splitLongCue({
				startMs: cue.startMs,
				endMs: cue.endMs,
				text,
				words: visibleWords,
			});
		});
}
