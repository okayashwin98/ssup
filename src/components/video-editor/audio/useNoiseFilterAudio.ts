import { useCallback, useEffect, useMemo, useState } from "react";
import { hasNoiseFilter, normalizeNoiseFilterStrength } from "@/lib/noiseFilterStrength";
import type { ClipRegion } from "../types";

const strengthKey = (strength: number) => String(normalizeNoiseFilterStrength(strength));

/**
 * The cleaned voice for clips with Filter noise on. The voice is the microphone file when
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
	const strengthsInUse = useMemo(
		() => [
			...new Set(
				clipRegions.filter(hasNoiseFilter).map((clip) => strengthKey(clip.noiseFilter)),
			),
		],
		[clipRegions],
	);
	const [cleaned, setCleaned] = useState<{
		sourcePath: string | null;
		pathByStrength: Record<string, string>;
	}>({ sourcePath: null, pathByStrength: {} });

	useEffect(() => {
		if (!sourcePath) return;
		const missing = strengthsInUse.filter(
			(key) => !(cleaned.sourcePath === sourcePath && cleaned.pathByStrength[key]),
		);
		if (missing.length === 0) return;
		let cancelled = false;
		// Wait for the Strength slider to settle, so a drag makes one copy rather than one per step.
		const timer = window.setTimeout(() => {
			for (const key of missing) {
				void window.electronAPI
					?.createCleanedAudio(sourcePath, Number(key))
					.then((result) => {
						if (cancelled) return;
						if (!result.success || !result.path) {
							console.warn("Noise filter unavailable:", result.error);
							return;
						}
						const cleanedPath = result.path;
						setCleaned((current) => ({
							sourcePath,
							pathByStrength: {
								...(current.sourcePath === sourcePath
									? current.pathByStrength
									: {}),
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
	}, [sourcePath, strengthsInUse, cleaned]);

	const pathByStrength = useMemo(
		() =>
			cleaned.sourcePath === sourcePath
				? Object.fromEntries(
						strengthsInUse
							.filter((key) => cleaned.pathByStrength[key])
							.map((key) => [key, cleaned.pathByStrength[key]]),
					)
				: {},
		[cleaned, sourcePath, strengthsInUse],
	);
	const alternatePaths = useMemo(() => Object.values(pathByStrength), [pathByStrength]);
	const activeClip = clipRegions.find((clip) => clip.id === activeClipId);
	const activeCleanedPath =
		activeClip && hasNoiseFilter(activeClip)
			? (pathByStrength[strengthKey(activeClip.noiseFilter)] ?? null)
			: null;

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
		cleanedAudioPathByStrength: pathByStrength,
		alternatePaths,
		getNoiseFilterGate,
		/** The video's own sound is the voice and the cleaned copy is playing instead. */
		replacesVideoAudio: activeCleanedPath !== null && sourcePath === videoPath,
	};
}
