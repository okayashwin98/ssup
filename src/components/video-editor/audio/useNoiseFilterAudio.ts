import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getClipVoiceCleanup,
	parseVoiceCleanupKey,
	voiceCleanupKey,
} from "@/lib/noiseFilterStrength";
import type { ClipRegion } from "../types";

const clipCleanupKey = (clip: ClipRegion) => {
	const cleanup = getClipVoiceCleanup(clip);
	return cleanup ? voiceCleanupKey(cleanup) : null;
};

/**
 * The cleaned voice for clips with Filter noise or Remove fillers on. The voice is the microphone file when
 * the recording has one, else the recording's own sound (a microphone-only recording).
 * Cleaned copies are made in the background; until one is ready the clip plays as recorded.
 */
export function useNoiseFilterAudio({
	clipRegions,
	activeClipId,
	previewSourceAudioFallbackPaths,
	shouldMutePreviewVideo,
	videoPath,
}: {
	clipRegions: ClipRegion[];
	activeClipId: string | null;
	previewSourceAudioFallbackPaths: string[];
	shouldMutePreviewVideo: boolean;
	videoPath: string | null;
}) {
	const sourcePath = useMemo(
		() =>
			previewSourceAudioFallbackPaths.find((audioPath) => /\.mic\./i.test(audioPath)) ??
			(shouldMutePreviewVideo ? null : videoPath),
		[previewSourceAudioFallbackPaths, shouldMutePreviewVideo, videoPath],
	);
	const cleanupsInUse = useMemo(
		() => [
			...new Set(
				clipRegions.map(clipCleanupKey).filter((key): key is string => key !== null),
			),
		],
		[clipRegions],
	);
	const [cleaned, setCleaned] = useState<{
		sourcePath: string | null;
		pathByCleanup: Record<string, string>;
	}>({ sourcePath: null, pathByCleanup: {} });

	useEffect(() => {
		if (!sourcePath) return;
		const missing = cleanupsInUse.filter(
			(key) => !(cleaned.sourcePath === sourcePath && cleaned.pathByCleanup[key]),
		);
		if (missing.length === 0) return;
		let cancelled = false;
		// Wait for the settings to settle, so quick toggling makes one copy rather than several.
		const timer = window.setTimeout(() => {
			for (const key of missing) {
				void window.electronAPI
					?.createCleanedAudio(sourcePath, parseVoiceCleanupKey(key))
					.then((result) => {
						if (cancelled) return;
						if (!result.success || !result.path) {
							console.warn("Voice cleanup unavailable:", result.error);
							return;
						}
						const cleanedPath = result.path;
						setCleaned((current) => ({
							sourcePath,
							pathByCleanup: {
								...(current.sourcePath === sourcePath ? current.pathByCleanup : {}),
								[key]: cleanedPath,
							},
						}));
					});
			}
		}, 500);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [sourcePath, cleanupsInUse, cleaned]);

	const pathByCleanup = useMemo(
		() =>
			cleaned.sourcePath === sourcePath
				? Object.fromEntries(
						cleanupsInUse
							.filter((key) => cleaned.pathByCleanup[key])
							.map((key) => [key, cleaned.pathByCleanup[key]]),
					)
				: {},
		[cleaned, sourcePath, cleanupsInUse],
	);
	const alternatePaths = useMemo(() => Object.values(pathByCleanup), [pathByCleanup]);
	const activeClip = clipRegions.find((clip) => clip.id === activeClipId);
	const activeKey = activeClip ? clipCleanupKey(activeClip) : null;
	const activeCleanedPath = activeKey ? (pathByCleanup[activeKey] ?? null) : null;

	/** 1 for the copy of the voice that should be heard now, 0 for the others. */
	const getNoiseFilterGate = useCallback(
		(audioPath: string) => {
			if (alternatePaths.includes(audioPath)) return audioPath === activeCleanedPath ? 1 : 0;
			if (audioPath === sourcePath && activeCleanedPath) return 0;
			return 1;
		},
		[alternatePaths, activeCleanedPath, sourcePath],
	);

	return {
		noiseFilterSourcePath: sourcePath,
		alternatePaths,
		getNoiseFilterGate,
		/** The video's own sound is the voice and the cleaned copy is playing instead. */
		replacesVideoAudio: activeCleanedPath !== null && sourcePath === videoPath,
	};
}
