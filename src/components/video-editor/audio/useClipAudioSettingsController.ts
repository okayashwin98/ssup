import React, { useCallback, useMemo } from "react";
import {
	SOURCE_AUDIO_NORMALIZE_GAIN,
	type SourceAudioTrackSettings,
} from "@/components/video-editor/audio/audioTypes";
import { useSourceAudioTrackSettings } from "./useSourceAudioTrackSettings";
import { withHiddenSourceTracksSilent } from "../timeline/timelineLayers";
import { getSourceTrackIdFromPath } from "@/lib/exporter/audioRoutingEngine";

interface UseClipAudioSettingsControllerParams {
	selectedClipId: string | null;
	activeClipId: string | null;
	sourceAudioTrackSettingsByClip: Record<string, SourceAudioTrackSettings>;
	setSourceAudioTrackSettingsByClip: React.Dispatch<
		React.SetStateAction<Record<string, SourceAudioTrackSettings>>
	>;
	defaultSourceAudioTrackSettings: SourceAudioTrackSettings;
	setDefaultSourceAudioTrackSettings: React.Dispatch<
		React.SetStateAction<SourceAudioTrackSettings>
	>;
	/** Timeline rows turned off; their source audio tracks play and export silent. */
	hiddenTimelineLayers?: readonly string[];
}

const NO_HIDDEN_LAYERS: readonly string[] = [];

export function useClipAudioSettingsController({
	selectedClipId,
	activeClipId,
	sourceAudioTrackSettingsByClip,
	setSourceAudioTrackSettingsByClip,
	defaultSourceAudioTrackSettings,
	setDefaultSourceAudioTrackSettings,
	hiddenTimelineLayers = NO_HIDDEN_LAYERS,
}: UseClipAudioSettingsControllerParams) {
	const {
		sourceAudioTrackMeta,
		activeSourceAudioTrackSettings: savedActiveSettings,
		selectedClipSourceAudioTrackSettings: savedSelectedSettings,
		getSourceAudioTrackSettingsForClip: getSavedSettingsForClip,
		onSourceAudioTracksMetaChange,
		onSelectedClipSourceAudioTrackVolumeChange,
		onSelectedClipSourceAudioTrackNormalizeChange,
	} = useSourceAudioTrackSettings({
		selectedClipId,
		activeClipId,
		sourceAudioTrackSettingsByClip,
		setSourceAudioTrackSettingsByClip,
		defaultSourceAudioTrackSettings,
		setDefaultSourceAudioTrackSettings,
	});

	const activeSourceAudioTrackSettings = useMemo(
		() => withHiddenSourceTracksSilent(savedActiveSettings, hiddenTimelineLayers),
		[savedActiveSettings, hiddenTimelineLayers],
	);
	// The clip panel shows the saved volumes; only what's heard is silenced.
	const selectedClipSourceAudioTrackSettings = savedSelectedSettings;
	const heardSelectedSettings = useMemo(
		() => withHiddenSourceTracksSilent(savedSelectedSettings, hiddenTimelineLayers),
		[savedSelectedSettings, hiddenTimelineLayers],
	);
	const getSourceAudioTrackSettingsForClip = useCallback(
		(clipId: string | null) =>
			withHiddenSourceTracksSilent(getSavedSettingsForClip(clipId), hiddenTimelineLayers),
		[getSavedSettingsForClip, hiddenTimelineLayers],
	);

	const previewSourceAudioTrackSettings = useMemo(
		() =>
			activeClipId ? activeSourceAudioTrackSettings : heardSelectedSettings,
		[activeClipId, activeSourceAudioTrackSettings, heardSelectedSettings],
	);

	const embeddedTrackId = useMemo<"mixed" | "system">(() => {
		const hasMixedTrack = sourceAudioTrackMeta.some((track) => track.id === "mixed");
		if (hasMixedTrack) return "mixed";
		const hasSystemTrack = sourceAudioTrackMeta.some((track) => track.id === "system");
		return hasSystemTrack ? "system" : "mixed";
	}, [sourceAudioTrackMeta]);

	const embeddedSourcePreviewGain = useMemo(() => {
		const settings = previewSourceAudioTrackSettings[embeddedTrackId] ?? {
			volume: 1,
			normalize: false,
		};
		const normalizeGain = settings.normalize ? SOURCE_AUDIO_NORMALIZE_GAIN : 1;
		return Math.max(0, Math.min(1, settings.volume * normalizeGain));
	}, [embeddedTrackId, previewSourceAudioTrackSettings]);

	const getSourceTrackPreviewGain = useCallback(
		(audioPath: string) => {
			const trackId = getSourceTrackIdFromPath(audioPath);
			const settings = previewSourceAudioTrackSettings[trackId] ?? {
				volume: 1,
				normalize: false,
			};
			const normalizeGain = settings.normalize ? SOURCE_AUDIO_NORMALIZE_GAIN : 1;
			return Math.max(0, Math.min(1, settings.volume * normalizeGain));
		},
		[previewSourceAudioTrackSettings],
	);

	return {
		sourceAudioTrackMeta,
		activeSourceAudioTrackSettings,
		selectedClipSourceAudioTrackSettings,
		getSourceAudioTrackSettingsForClip,
		onSourceAudioTracksMetaChange,
		onSelectedClipSourceAudioTrackVolumeChange,
		onSelectedClipSourceAudioTrackNormalizeChange,
		embeddedSourcePreviewGain,
		getSourceTrackPreviewGain,
	};
}
