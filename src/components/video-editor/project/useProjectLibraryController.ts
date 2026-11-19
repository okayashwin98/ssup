/* biome-ignore-all lint/correctness/useExhaustiveDependencies: grouped editor domain objects contain the thumbnail renderer dependencies. */
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { toFileUrl } from "../projectPersistence";
import { renderProjectThumbnail } from "../projectThumbnailRender";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useProjectState } from "../state/useProjectState";
import type { useTimelineState } from "../state/useTimelineState";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { followProjectPathMoves } from "./projectPathMoves";

type Input = {
	project: ReturnType<typeof useProjectState>;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	currentTime: number;
	effectiveShowCursor: boolean;
};

export const PROJECT_LIBRARY_CHANGED_EVENT = "supershare-project-library-changed";

export function useProjectLibraryController({
	project,
	appearance,
	timeline,
	videoPlaybackRef,
	effectiveShowCursor,
}: Input) {
	const { setProjectLibraryEntries, setProjectLibraryLoading } = project;
	const {
		backgroundBlur,
		borderRadius,
		connectZooms,
		connectedZoomDurationMs,
		connectedZoomEasing,
		connectedZoomGapMs,
		cropRegion,
		cursorClickBounce,
		cursorClickBounceDuration,
		cursorClickEffect,
		cursorClickEffectColor,
		cursorClickEffectScale,
		cursorClickEffectOpacity,
		cursorClickEffectDurationMs,
		cursorMotionBlur,
		cursorSize,
		cursorSmoothing,
		cursorSpringDampingMultiplier,
		cursorSpringMassMultiplier,
		cursorSpringStiffnessMultiplier,
		cameraSpringStiffnessMultiplier,
		cameraSpringDampingMultiplier,
		cameraSpringMassMultiplier,
		zoomSmoothness,
		cursorStyle,
		cursorSway,
		cursorIdleHide,
		padding,
		resolvedWebcamVideoUrl,
		shadowIntensity,
		wallpaper,
		webcam,
		zoomInDurationMs,
		zoomInEasing,
		zoomInOverlapMs,
		zoomMotionBlur,
		zoomMotionBlurTuning,
		zoomOutDurationMs,
		zoomOutEasing,
		zoomClassicMode,
	} = appearance;
	const {
		annotationRegions,
		autoCaptionSettings,
		autoCaptions,
		cursorTelemetry,
		clipRegions,
		speedRegions,
		zoomRegions,
	} = timeline;
	const thumbnailUpdates = useRef(
		new Map<string, { thumbnailPath: string; updatedAt: number }>(),
	);
	const refreshProjectLibrary = useCallback(async () => {
		setProjectLibraryLoading(true);
		try {
			const result = await window.electronAPI.listProjectFiles();
			if (!result.success) {
				throw new Error(result.error || "Failed to load project library");
			}
			if (result.pathMoves) followProjectPathMoves(result.pathMoves);

			setProjectLibraryEntries(
				result.entries.map((entry) => {
					const ready = thumbnailUpdates.current.get(entry.path);
					return ready?.updatedAt === entry.updatedAt
						? { ...entry, thumbnailPath: ready.thumbnailPath }
						: entry;
				}),
			);
			const paths = new Set(result.entries.map((entry) => entry.path));
			for (const key of thumbnailUpdates.current.keys()) {
				if (!paths.has(key)) thumbnailUpdates.current.delete(key);
			}
		} catch (projectLibraryError) {
			console.warn("Unable to refresh project library:", projectLibraryError);
		} finally {
			setProjectLibraryLoading(false);
		}
	}, []);

	// Home asks for a fresh list after it adds projects itself (bulk import).
	useEffect(() => {
		const refresh = () => void refreshProjectLibrary();
		window.addEventListener(PROJECT_LIBRARY_CHANGED_EVENT, refresh);
		return () => window.removeEventListener(PROJECT_LIBRARY_CHANGED_EVENT, refresh);
	}, [refreshProjectLibrary]);

	useEffect(
		() =>
			window.electronAPI.onProjectThumbnailReady?.((ready) => {
				thumbnailUpdates.current.set(ready.path, ready);
				setProjectLibraryEntries((entries) =>
					entries.map((entry) =>
						entry.path === ready.path && entry.updatedAt === ready.updatedAt
							? { ...entry, thumbnailPath: ready.thumbnailPath }
							: entry,
					),
				);
			}),
		[setProjectLibraryEntries],
	);

	const captureProjectThumbnail = useCallback(async () => {
		const previewHandle = videoPlaybackRef.current;
		const previewVideo = previewHandle?.video ?? null;
		const source = previewVideo?.currentSrc || previewVideo?.src;
		if (!previewVideo || !source || !previewVideo.videoWidth || !previewVideo.videoHeight)
			return null;
		try {
			return await renderProjectThumbnail(source, {
				wallpaper,
				zoomRegions,
				shadowIntensity,
				backgroundBlur,
				zoomMotionBlur,
				zoomMotionBlurTuning,
				connectZooms,
				zoomInDurationMs,
				zoomInOverlapMs,
				zoomOutDurationMs,
				connectedZoomGapMs,
				connectedZoomDurationMs,
				zoomInEasing,
				zoomOutEasing,
				connectedZoomEasing,
				borderRadius,
				padding,
				cropRegion,
				webcam,
				webcamUrl:
					resolvedWebcamVideoUrl ??
					(webcam.sourcePath ? toFileUrl(webcam.sourcePath) : null),
				annotationRegions,
				autoCaptions,
				autoCaptionSettings,
				clipRegions,
				speedRegions,
				previewWidth: previewHandle?.containerRef.current?.clientWidth || 1920,
				previewHeight: previewHandle?.containerRef.current?.clientHeight || 1080,
				cursorTelemetry,
				showCursor: effectiveShowCursor,
				cursorStyle,
				cursorSize,
				cursorSmoothing,
				cursorSpringStiffnessMultiplier,
				cursorSpringDampingMultiplier,
				cursorSpringMassMultiplier,
				cameraSpringStiffnessMultiplier,
				cameraSpringDampingMultiplier,
				cameraSpringMassMultiplier,
				zoomSmoothness,
				zoomClassicMode,
				cursorMotionBlur,
				cursorClickEffect,
				cursorClickEffectColor,
				cursorClickEffectScale,
				cursorClickEffectOpacity,
				cursorClickEffectDurationMs,
				cursorClickBounce,
				cursorClickBounceDuration,
				cursorSway,
				cursorIdleHide,
			});
		} catch (thumbnailRenderError) {
			console.warn("Unable to render thumbnail from composed frame:", thumbnailRenderError);
		}

		return null;
	}, [
		annotationRegions,
		autoCaptionSettings,
		autoCaptions,
		backgroundBlur,
		borderRadius,
		connectZooms,
		connectedZoomDurationMs,
		connectedZoomEasing,
		connectedZoomGapMs,
		cropRegion,
		cursorClickBounce,
		cursorClickBounceDuration,
		cursorClickEffect,
		cursorClickEffectColor,
		cursorClickEffectScale,
		cursorClickEffectOpacity,
		cursorClickEffectDurationMs,
		cursorMotionBlur,
		cursorSize,
		cursorSmoothing,
		cursorSpringDampingMultiplier,
		cursorSpringMassMultiplier,
		cursorSpringStiffnessMultiplier,
		cameraSpringStiffnessMultiplier,
		cameraSpringDampingMultiplier,
		cameraSpringMassMultiplier,
		zoomSmoothness,
		cursorStyle,
		cursorSway,
		cursorIdleHide,
		cursorTelemetry,
		clipRegions,
		padding,
		resolvedWebcamVideoUrl,
		shadowIntensity,
		effectiveShowCursor,
		speedRegions,
		wallpaper,
		webcam,
		zoomInDurationMs,
		zoomInEasing,
		zoomInOverlapMs,
		zoomMotionBlur,
		zoomMotionBlurTuning,
		zoomOutDurationMs,
		zoomOutEasing,
		zoomRegions,
		zoomClassicMode,
	]);

	return { refreshProjectLibrary, captureProjectThumbnail };
}
