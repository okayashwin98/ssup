import { getClipVoiceCleanup, voiceCleanupKey } from "@/lib/noiseFilterStrength";
import type { SourceAudioTrackSettings } from "./audio/audioTypes";
import { type ClipRegion, getClipSourceStartMs, sortClipRegions } from "./types";

/** A shift-click selection: where it started, and the clip list it was made on. */
export type ClipRangeSelection = {
	anchorId: string;
	ids: string[];
	clips: ClipRegion[];
};

/** Shift selection follows timeline order, including every clip between the endpoints. */
export function selectClipRange(clips: ClipRegion[], anchorId: string, targetId: string): string[] {
	const ordered = sortClipRegions(clips);
	const anchor = ordered.findIndex((clip) => clip.id === anchorId);
	const target = ordered.findIndex((clip) => clip.id === targetId);
	if (target < 0) return [];
	if (anchor < 0) return [targetId];
	return ordered
		.slice(Math.min(anchor, target), Math.max(anchor, target) + 1)
		.map((clip) => clip.id);
}

/**
 * The clips shown as selected. A range only counts while the clip list it was made on is
 * unchanged and still holds the single selected clip; otherwise selection is that one clip.
 */
export function resolveSelectedClipIds(
	clips: ClipRegion[],
	selectedClipId: string | null,
	range: ClipRangeSelection | null,
): string[] {
	if (!selectedClipId) return [];
	return range && range.clips === clips && range.ids.includes(selectedClipId)
		? range.ids
		: [selectedClipId];
}

function sameAudioSettings(a: SourceAudioTrackSettings, b: SourceAudioTrackSettings): boolean {
	return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
		(id) =>
			(a[id]?.volume ?? 1) === (b[id]?.volume ?? 1) &&
			Boolean(a[id]?.normalize) === Boolean(b[id]?.normalize),
	);
}

/** Filter noise and Remove fillers, as the one key their shared cleaned voice is kept under. */
function voiceCleanupOf(clip: ClipRegion): string {
	const cleanup = getClipVoiceCleanup(clip);
	return cleanup ? voiceCleanupKey(cleanup) : "";
}

function sameCleanedAudio(a: ClipRegion, b: ClipRegion): boolean {
	return (
		a.cleanedAudio?.path === b.cleanedAudio?.path &&
		a.cleanedAudio?.sourcePath === b.cleanedAudio?.sourcePath
	);
}

/**
 * Joins the selected clips into the first one, or returns null when they cannot be joined.
 * They must be neighbours playing one unbroken stretch of the recording, with the same speed,
 * mute, audio levels and voice cleanup, so the joined clip plays exactly what they played.
 * The first clip keeps its id and settings; its cleaned voice is the one the others shared.
 */
export function planClipMerge(
	clips: ClipRegion[],
	selectedIds: string[],
	getAudioSettings: (id: string) => SourceAudioTrackSettings = () => ({}),
): ClipRegion[] | null {
	const ids = new Set(selectedIds);
	if (ids.size < 2) return null;
	const ordered = sortClipRegions(clips);
	const selected = ordered.filter((clip) => ids.has(clip.id));
	if (selected.length !== ids.size) return null;
	const first = selected[0];
	const audio = getAudioSettings(first.id);
	const cleanup = voiceCleanupOf(first);
	for (let index = 1; index < selected.length; index++) {
		const previous = selected[index - 1];
		const clip = selected[index];
		if (
			ordered.indexOf(clip) !== ordered.indexOf(previous) + 1 ||
			previous.endMs !== clip.startMs ||
			!Number.isFinite(first.speed) ||
			first.speed <= 0 ||
			clip.speed !== first.speed ||
			Boolean(clip.muted) !== Boolean(first.muted) ||
			Boolean(clip.showSourceAudio) !== Boolean(first.showSourceAudio) ||
			clip.sourceMinMs !== first.sourceMinMs ||
			clip.sourceMaxMs !== first.sourceMaxMs ||
			Math.abs(
				getClipSourceStartMs(clip) -
					(getClipSourceStartMs(first) + (clip.startMs - first.startMs) * first.speed),
			) > 0.5 ||
			voiceCleanupOf(clip) !== cleanup ||
			!sameCleanedAudio(clip, first) ||
			!sameAudioSettings(audio, getAudioSettings(clip.id))
		)
			return null;
	}
	const merged = {
		...first,
		sourceStartMs: getClipSourceStartMs(first),
		endMs: selected[selected.length - 1].endMs,
	};
	return ordered.flatMap((clip) =>
		clip.id === first.id ? [merged] : ids.has(clip.id) ? [] : [clip],
	);
}
