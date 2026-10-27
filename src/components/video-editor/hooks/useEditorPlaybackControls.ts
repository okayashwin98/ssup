import { type RefObject, useCallback, useEffect, useRef } from "react";

// A single seek during playback just carries on from the new spot. Seeks closer together
// than this (dragging the playhead) pause, and playing resumes once they stop, so a drag
// scrubs smoothly instead of restarting the video on every move.
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
	const lastSeekAt = useRef(Number.NEGATIVE_INFINITY);
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

		// Paused mid-drag, the button shows Play: pressing it plays now.
		if (resumeTimer.current !== null) {
			cancelResume();
			startPlayback();
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
			const playing = Boolean(playback?.isPlaying) || resumeTimer.current !== null;
			const now = performance.now();
			const dragging = now - lastSeekAt.current < RESUME_AFTER_SEEK_MS;
			lastSeekAt.current = now;
			if (!playing || (!dragging && resumeTimer.current === null)) {
				handleSeek(time);
				return;
			}
			handleSeek(time, { pause: true });
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
