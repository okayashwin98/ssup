import {
	getClipVoiceCleanup,
	parseVoiceCleanupKey,
	voiceCleanupKey,
} from "@/lib/noiseFilterStrength";
import type { ClipRegion } from "../types";

/** Clips for export, each with a cleaned voice pointing at that copy (made now if needed). */
export async function withCleanedAudio(
	clips: ClipRegion[],
	sourcePath: string | null,
): Promise<ClipRegion[]> {
	const keyOf = (clip: ClipRegion) => {
		const cleanup = getClipVoiceCleanup(clip);
		return cleanup ? voiceCleanupKey(cleanup) : null;
	};
	if (!sourcePath || !clips.some((clip) => keyOf(clip) !== null)) return clips;
	const pathByKey = new Map<string, string>();
	for (const key of new Set(clips.map(keyOf))) {
		if (key === null) continue;
		const result = await window.electronAPI.createCleanedAudio(
			sourcePath,
			parseVoiceCleanupKey(key),
		);
		if (!result.success || !result.path)
			throw new Error(`Could not clean the voice: ${result.error ?? "unknown error"}`);
		pathByKey.set(key, result.path);
	}
	return clips.map((clip) => {
		const key = keyOf(clip);
		const path = key ? pathByKey.get(key) : undefined;
		return path ? { ...clip, cleanedAudio: { sourcePath, path } } : clip;
	});
}
