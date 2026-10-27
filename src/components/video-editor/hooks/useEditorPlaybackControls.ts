import { type RefObject, useCallback, useEffect, useRef } from "react";

// A seek during playback pauses, and playing resumes once seeks stop for this long, so
// dragging the playhead scrubs smoothly instead of restarting the video on every move.
const RESUME_AFTER_SEEK_MS = 150;
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";

interface UseEditorPlaybackControlsParams {
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	playSourceAudioPreview: () => void;
	timelinePlayheadTime: number;
	timelineDuration: number;
}

export function useEditorPlaybackControls({
	videoPlaybackRef,
	timelineRef,
	playSourceAudioPreview,
	timelinePlayheadTime,
	timelineDuration,
}: UseEditorPlaybackControlsParams) {
	const getActivePlayback = useCallback(() => videoPlaybackRef.current, [videoPlaybackRef]);
	const resumeTimer = useRef<number | null>(null);
	const cancelResume = useCallback(() => {
		if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
		resumeTimer.current = null;
	}, []);
	useEffect(() => cancelResume, [cancelResume]);

	const startPlayback = useCallback(() => {
		const playback = getActivePlayback();
		if (!playback?.video) return;

		playSourceAudioPreview();
		playback.play().catch((error) => console.error("Video play failed:", error));
	}, [getActivePlayback, playSourceAudioPreview]);

	const togglePlayPause = useCallback(() => {
		const playback = getActivePlayback();
		const video = playback?.video;
		if (!playback || !video) return;

		// Waiting to resume after a seek counts as playing.
		if (resumeTimer.current !== null) {
			cancelResume();
			return;
		}
		if (playback.isPlaying) playback.pause();
		else startPlayback();
	}, [getActivePlayback, startPlayback, cancelResume]);

	const handleSeek = useCallback(
		(time: number, options: { pause?: boolean } = {}) => {
			const playback = getActivePlayback();
			const video = playback?.video;
			if (!video) return;

			if (options.pause) playback.pause();
			playback.seekTimeline(time);
		},
		[getActivePlayback],
	);

	// Playing keeps playing from the new position; paused stays paused.
	const handleTimelineSeek = useCallback(
		(time: number) => {
			const playback = getActivePlayback();
			const wasPlaying = Boolean(playback?.isPlaying) || resumeTimer.current !== null;
			handleSeek(time, { pause: wasPlaying });
			if (!wasPlaying) return;
			cancelResume();
			resumeTimer.current = window.setTimeout(() => {
				resumeTimer.current = null;
				startPlayback();
			}, RESUME_AFTER_SEEK_MS);
		},
		[getActivePlayback, handleSeek, cancelResume, startPlayback],
	);

	const handlePreviewSkipBack = useCallback(() => {
		const currentMs = timelinePlayheadTime * 1000;
		const keyframes = timelineRef.current?.keyframes ?? [];
		const previous = [...keyframes]
			.reverse()
			.find((keyframe) => keyframe.time < currentMs - 50);
		handleSeek(previous ? previous.time / 1000 : Math.max(0, timelinePlayheadTime - 5));
	}, [handleSeek, timelinePlayheadTime, timelineRef]);

	const handlePreviewSkipForward = useCallback(() => {
		const currentMs = timelinePlayheadTime * 1000;
		const keyframes = timelineRef.current?.keyframes ?? [];
		const next = keyframes.find((keyframe) => keyframe.time > currentMs + 50);
		handleSeek(next ? next.time / 1000 : Math.min(timelineDuration, timelinePlayheadTime + 5));
	}, [handleSeek, timelineDuration, timelinePlayheadTime, timelineRef]);

	return {
		startPlayback,
		togglePlayPause,
		handleSeek,
		handleTimelineSeek,
		handlePreviewSkipBack,
		handlePreviewSkipForward,
	};
}
