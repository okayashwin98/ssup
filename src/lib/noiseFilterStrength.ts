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
