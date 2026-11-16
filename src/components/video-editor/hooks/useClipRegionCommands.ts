import type { ClipSequenceSpan } from "../timeline/core/timelineTypes";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { toast } from "@/components/ui/toast";
import type { SourceAudioTrackSettings } from "../audio/audioTypes";
import { type ClipRangeSelection, planClipMerge, selectClipRange } from "../clipMerge";
import { changeClipSpan } from "../clipSpanChange";
import {
	packClipSequence,
	reorderClipSequence,
	rippleRegionAnchors,
	rippleRegions,
} from "../clipSequence";
import { getClipSourceStartMs, type AnnotationRegion, type AudioRegion } from "../types";
import { planClipSplit } from "../clipSplit";
import type { ClipRegion, EditorEffectSection, ZoomRegion } from "../types";
import { supportsPreviewPlaybackRate } from "../videoPlayback/playbackRate";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseClipRegionCommandsParams {
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	sourceDurationMs: number;
	clipRegions: ClipRegion[];
	setClipRegions: Dispatch<SetStateAction<ClipRegion[]>>;
	zoomRegions: ZoomRegion[];
	setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>;
	selectedClipId: string | null;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	/** Every selected clip: one, or a Shift-selected range. */
	selectedClipIds: string[];
	clipRangeSelection: ClipRangeSelection | null;
	setClipRangeSelection: Dispatch<SetStateAction<ClipRangeSelection | null>>;
	getSourceAudioTrackSettingsForClip: (clipId: string | null) => SourceAudioTrackSettings;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextClipIdRef: MutableRefObject<number>;
	t: Translator;
}

export function useClipRegionCommands({
	setAnnotationRegions,
	setAudioRegions,
	sourceDurationMs,
	clipRegions,
	setClipRegions,
	setZoomRegions,
	selectedClipId,
	setSelectedClipId,
	selectedClipIds,
	clipRangeSelection,
	setClipRangeSelection,
	getSourceAudioTrackSettingsForClip,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextClipIdRef,
	t,
}: UseClipRegionCommandsParams) {
	const applySequence = useCallback(
		(edited: ClipRegion[]) => {
			const next = packClipSequence(edited);
			setClipRegions(next);
			setZoomRegions((current) => rippleRegions(current, clipRegions, next));
			setAnnotationRegions((current) => rippleRegions(current, clipRegions, next));
			setAudioRegions((current) => rippleRegionAnchors(current, clipRegions, next));
		},
		[clipRegions, setClipRegions, setZoomRegions, setAnnotationRegions, setAudioRegions],
	);

	const handleSelectClip = useCallback(
		(id: string | null, extend = false) => {
			// Shift-click selects every clip from where the selection started to this one.
			if (id && extend && selectedClipId) {
				const anchorId =
					selectedClipIds.length > 1 && clipRangeSelection
						? clipRangeSelection.anchorId
						: selectedClipId;
				setClipRangeSelection({
					anchorId,
					ids: selectClipRange(clipRegions, anchorId, id),
					clips: clipRegions,
				});
			} else {
				setClipRangeSelection(null);
			}
			setSelectedClipId(id);
			if (id) {
				setActiveEffectSection("clip");
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
				setSelectedCaptionId(null);
			} else {
				setActiveEffectSection((section) => (section === "clip" ? "scene" : section));
			}
		},
		[
			clipRegions,
			selectedClipId,
			selectedClipIds,
			clipRangeSelection,
			setClipRangeSelection,
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedClipId,
			setSelectedZoomId,
		],
	);

	const handleClipSplit = useCallback(
		(splitMs: number) => {
			const plan = planClipSplit({
				clipRegions,
				splitMs,
				createId: () => `clip-${nextClipIdRef.current++}`,
			});
			if (!plan) return;
			setClipRegions((current) =>
				current.flatMap((clip) =>
					clip.id === plan.targetId ? [plan.left, plan.right] : [clip],
				),
			);
			handleSelectClip(plan.left.id);
		},
		[clipRegions, nextClipIdRef, setClipRegions, handleSelectClip],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: ClipSequenceSpan) => {
			const oldClip = clipRegions.find((clip) => clip.id === id);
			const newStart = Math.round(span.start);
			const newEnd = Math.round(span.end);

			if (!oldClip) return;
			if (span.sequenceIndex !== undefined) {
				applySequence(reorderClipSequence(clipRegions, id, span.sequenceIndex));
				return;
			}
			applySequence(
				clipRegions.map((clip) =>
					clip.id === id
						? changeClipSpan(clip, newStart, newEnd, sourceDurationMs)
						: clip,
				),
			);
		},
		[clipRegions, applySequence, sourceDurationMs],
	);

	const handleClipSpeedChange = useCallback(
		(speed: number) => {
			if (!selectedClipId || !Number.isFinite(speed) || speed <= 0) return;
			if (!supportsPreviewPlaybackRate(speed)) {
				toast.error(
					t(
						"editor.timeline.unsupportedSpeed",
						"This speed is not supported for preview on this device.",
					),
				);
				return;
			}

			applySequence(
				clipRegions.map((clip) =>
					clip.id === selectedClipId
						? {
								...clip,
								sourceStartMs: getClipSourceStartMs(clip),
								speed,
								endMs:
									clip.startMs +
									Math.max(
										1,
										Math.round(
											((clip.endMs - clip.startMs) * clip.speed) / speed,
										),
									),
							}
						: clip,
				),
			);
		},
		[clipRegions, selectedClipId, applySequence, t],
	);

	const handleClipMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => (clip.id === selectedClipId ? { ...clip, muted } : clip)),
			);
		},
		[selectedClipId, setClipRegions],
	);
	/** Strength 0 turns the filter off. */
	const handleClipNoiseFilterChange = useCallback(
		(strength: number) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => {
					if (clip.id !== selectedClipId) return clip;
					const { noiseFilter: _previous, ...rest } = clip;
					return strength > 0 ? { ...rest, noiseFilter: strength } : rest;
				}),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipRemoveFillersChange = useCallback(
		(remove: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => {
					if (clip.id !== selectedClipId) return clip;
					const { removeFillers: _previous, ...rest } = clip;
					return remove ? { ...rest, removeFillers: true } : rest;
				}),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipShowSourceAudioChange = useCallback(
		(showSourceAudio: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) =>
					clip.id === selectedClipId ? { ...clip, showSourceAudio } : clip,
				),
			);
		},
		[selectedClipId, setClipRegions],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			applySequence(clipRegions.filter((clip) => clip.id !== id));
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[clipRegions, selectedClipId, applySequence, setSelectedClipId],
	);

	const canMergeSelectedClips =
		planClipMerge(clipRegions, selectedClipIds, getSourceAudioTrackSettingsForClip) !== null;
	/** Joins the selected range into its first clip; one step in the undo history. */
	const handleMergeSelectedClips = useCallback(() => {
		const next = planClipMerge(
			clipRegions,
			selectedClipIds,
			getSourceAudioTrackSettingsForClip,
		);
		const merged = next?.find((clip) => selectedClipIds.includes(clip.id));
		if (!next || !merged) return;
		setClipRegions(next);
		handleSelectClip(merged.id);
	}, [
		clipRegions,
		selectedClipIds,
		getSourceAudioTrackSettingsForClip,
		setClipRegions,
		handleSelectClip,
	]);

	return {
		selectedClipIds,
		canMergeSelectedClips,
		handleMergeSelectedClips,
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		handleClipMutedChange,
		handleClipNoiseFilterChange,
		handleClipRemoveFillersChange,
		handleClipShowSourceAudioChange,
		handleClipDelete,
	};
}
