import type { SourceAudioTrackSettings } from "../audio/audioTypes";

/**
 * Timeline rows that can be turned off from their icon. Off leaves a row's content in the
 * project but out of the preview and the export, like hiding a track in other editors.
 * Zooms use the project's own zoomsEnabled switch.
 */
export type TimelineLayerId =
	| "video"
	| `source:${string}`
	| `annotation:${number}`
	| `audio:${number}`;

export function isTimelineLayerOn(hidden: readonly string[], id: TimelineLayerId) {
	return !hidden.includes(id);
}

export function toggleTimelineLayer(hidden: readonly string[], id: TimelineLayerId) {
	return hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id];
}

/** Regions on rows that are on; a region's row is its trackIndex. */
export function visibleTrackRegions<T extends { trackIndex?: number }>(
	regions: T[],
	hidden: readonly string[],
	kind: "annotation" | "audio",
): T[] {
	if (!hidden.some((id) => id.startsWith(`${kind}:`))) return regions;
	return regions.filter((region) =>
		isTimelineLayerOn(hidden, `${kind}:${region.trackIndex ?? 0}`),
	);
}

/** Source audio tracks whose row is off play and export silent. */
export function withHiddenSourceTracksSilent(
	settings: SourceAudioTrackSettings,
	hidden: readonly string[],
): SourceAudioTrackSettings {
	if (!hidden.some((id) => id.startsWith("source:"))) return settings;
	const next: SourceAudioTrackSettings = { ...settings };
	for (const id of hidden) {
		if (!id.startsWith("source:")) continue;
		const track = id.slice("source:".length);
		next[track] = { ...(next[track] ?? { normalize: false }), volume: 0 };
	}
	return next;
}

export function normalizeHiddenTimelineLayers(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter(
				(id): id is string =>
					typeof id === "string" &&
					/^(video|source:[a-z]+|annotation:\d+|audio:\d+)$/.test(id),
			),
		),
	].slice(0, 64);
}
