import { hasNoiseFilter, normalizeNoiseFilterStrength } from "@/lib/noiseFilterStrength";
import type { ClipRegion } from "../types";

/** Clips for export, each noise-filtered one pointing at its cleaned voice (made now if needed). */
export async function withCleanedAudio(
	clips: ClipRegion[],
	sourcePath: string | null,
): Promise<ClipRegion[]> {
	if (!sourcePath || !clips.some(hasNoiseFilter)) return clips;
	const pathByStrength = new Map<number, string>();
	for (const clip of clips.filter(hasNoiseFilter)) {
		const strength = normalizeNoiseFilterStrength(clip.noiseFilter);
		if (pathByStrength.has(strength)) continue;
		const result = await window.electronAPI.createCleanedAudio(sourcePath, strength);
		if (!result.success || !result.path)
			throw new Error(
				`Filter noise could not prepare the audio: ${result.error ?? "unknown error"}`,
			);
		pathByStrength.set(strength, result.path);
	}
	return clips.map((clip) => {
		if (!hasNoiseFilter(clip)) return clip;
		const path = pathByStrength.get(normalizeNoiseFilterStrength(clip.noiseFilter));
		return path ? { ...clip, cleanedAudio: { sourcePath, path } } : clip;
	});
}
