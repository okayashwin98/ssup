import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Where a clip's cleaned voice stands: being made (step and share done), or failed. */
export type VoiceCleanupStatus =
	| { state: "working"; stage: string; fraction: number }
	| { state: "error"; message: string };

/**
 * The cleaned voice for clips with Filter noise or Remove fillers on. The voice is the microphone
 * file when the recording has one, else the recording's own sound (a microphone-only recording).
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
	// Everything is kept per "source|cleanup", so switching recordings never mixes them up.
	const [cleaned, setCleaned] = useState<Record<string, string>>({});
	const [status, setStatus] = useState<Record<string, VoiceCleanupStatus>>({});
	const requested = useRef(new Set<string>());
	// Read, not watched: progress updates must not restart the wait before a new job.
	const statusRef = useRef(status);
	statusRef.current = status;
	const [retries, setRetries] = useState(0);
	const id = useCallback((key: string) => `${sourcePath}|${key}`, [sourcePath]);

	useEffect(
		() =>
			window.electronAPI?.onVoiceCleanupProgress((progress) => {
				const key = `${progress.sourcePath}|${voiceCleanupKey(progress.cleanup)}`;
				setStatus((current) =>
					current[key]?.state === "working"
						? {
								...current,
								[key]: {
									state: "working",
									stage: progress.stage,
									fraction: progress.fraction,
								},
							}
						: current,
				);
			}),
		[],
	);

	useEffect(() => {
		if (!sourcePath) return;
		// A retry clears a failure; this re-runs to ask again.
		void retries;
		const missing = cleanupsInUse.filter(
			(key) =>
				!cleaned[id(key)] &&
				!requested.current.has(id(key)) &&
				statusRef.current[id(key)]?.state !== "error",
		);
		if (missing.length === 0) return;
		// The pie shows at once; the work waits for the settings to settle, so quick toggling
		// makes one copy rather than several.
		if (missing.some((key) => !statusRef.current[id(key)]))
			setStatus((current) => {
				const next = { ...current };
				for (const key of missing)
					next[id(key)] ??= { state: "working", stage: "Preparing", fraction: 0 };
				return next;
			});
		const timer = window.setTimeout(() => {
			for (const key of missing) {
				const job = id(key);
				requested.current.add(job);
				void window.electronAPI
					?.createCleanedAudio(sourcePath, parseVoiceCleanupKey(key))
					.then((result) => {
						if (result.success && result.path) {
							const cleanedPath = result.path;
							setCleaned((current) => ({ ...current, [job]: cleanedPath }));
						}
						setStatus((current) => {
							const { [job]: _done, ...rest } = current;
							return result.success && result.path
								? rest
								: {
										...rest,
										[job]: {
											state: "error",
											message:
												result.error ?? "The voice could not be cleaned.",
										},
									};
						});
					})
					.finally(() => requested.current.delete(job));
			}
		}, 500);
		return () => window.clearTimeout(timer);
	}, [sourcePath, cleanupsInUse, cleaned, id, retries]);

	const pathByCleanup = useMemo(
		() =>
			Object.fromEntries(
				cleanupsInUse
					.filter((key) => cleaned[id(key)])
					.map((key) => [key, cleaned[id(key)]]),
			),
		[cleaned, cleanupsInUse, id],
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

	/** Where a clip's cleaned voice stands; null when it is ready or not asked for. */
	const getVoiceCleanupStatus = useCallback(
		(clip: ClipRegion | null | undefined): VoiceCleanupStatus | null => {
			const key = clip ? clipCleanupKey(clip) : null;
			return key && sourcePath ? (status[id(key)] ?? null) : null;
		},
		[status, sourcePath, id],
	);
	/** Tries a failed cleanup again. */
	const retryVoiceCleanup = useCallback(
		(clip: ClipRegion | null | undefined) => {
			const key = clip ? clipCleanupKey(clip) : null;
			if (!key) return;
			setStatus((current) => {
				const { [id(key)]: _failed, ...rest } = current;
				return rest;
			});
			setRetries((count) => count + 1);
		},
		[id],
	);
	/** Clips whose cleaned voice is still being made, for the timeline. */
	const preparingClipIds = useMemo(
		() =>
			new Set(
				clipRegions
					.filter((clip) => getVoiceCleanupStatus(clip)?.state === "working")
					.map((clip) => clip.id),
			),
		[clipRegions, getVoiceCleanupStatus],
	);

	return {
		noiseFilterSourcePath: sourcePath,
		alternatePaths,
		getNoiseFilterGate,
		getVoiceCleanupStatus,
		retryVoiceCleanup,
		preparingClipIds,
		/** The video's own sound is the voice and the cleaned copy is playing instead. */
		replacesVideoAudio: activeCleanedPath !== null && sourcePath === videoPath,
	};
}
