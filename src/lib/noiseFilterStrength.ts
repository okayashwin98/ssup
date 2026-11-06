/** Noise filter strength in tenths (0.1–1), so each setting maps to one cleaned file. */
export function normalizeNoiseFilterStrength(strength: number) {
	return Math.min(1, Math.max(0.1, Math.round(strength * 10) / 10));
}

/** Clips whose sound the exporter must render itself rather than copy from the recording. */
export function clipNeedsRenderedAudio(clip: { muted?: boolean; cleanedAudio?: unknown }) {
	return Boolean(clip.muted) || Boolean(clip.cleanedAudio);
}

/** True when a clip's audio is heard through the noise filter. */
export function hasNoiseFilter<T extends { noiseFilter?: number }>(
	clip: T,
): clip is T & { noiseFilter: number } {
	return typeof clip.noiseFilter === "number" && clip.noiseFilter > 0;
}

export type VoiceCleanup = { noise?: number; fillers?: boolean };

/** What a clip's voice is cleaned of, or null when it plays as recorded. */
export function getClipVoiceCleanup(clip: {
	noiseFilter?: number;
	removeFillers?: boolean;
}): VoiceCleanup | null {
	const noise = hasNoiseFilter(clip) ? normalizeNoiseFilterStrength(clip.noiseFilter) : undefined;
	const fillers = clip.removeFillers === true || undefined;
	return noise || fillers ? { noise, fillers } : null;
}

/** One key per distinct cleanup, so clips with the same settings share one cleaned copy. */
export function voiceCleanupKey(cleanup: VoiceCleanup) {
	return `${cleanup.noise ?? 0}|${cleanup.fillers ? 1 : 0}`;
}

export function parseVoiceCleanupKey(key: string): VoiceCleanup {
	const [noise, fillers] = key.split("|");
	return { noise: Number(noise) || undefined, fillers: fillers === "1" || undefined };
}
