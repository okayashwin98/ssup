import { FrameRenderer } from "@/lib/exporter/frameRenderer";
import { PROJECT_THUMBNAIL_HEIGHT, PROJECT_THUMBNAIL_WIDTH } from "@/lib/projectThumbnail";
import type { ProjectEditorState } from "./projectPersistence";
import {
	type CursorTelemetryPoint,
	getClipSourceEndMs,
	getClipSourceStartMs,
	type SpeedRegion,
} from "./types";
import { findPreviewClipAtTimelineTime } from "./videoPlayback/clipPlayback";

export type ProjectThumbnailSettings = Omit<
	ProjectEditorState,
	| "showCursor"
	| "loopCursor"
	| "zoomsEnabled"
	| "hiddenTimelineLayers"
	| "trimRegions"
	| "audioRegions"
	| "aspectRatio"
> & {
	cursorTelemetry: CursorTelemetryPoint[];
	showCursor: boolean;
	webcamUrl: string | null;
	previewWidth?: number;
	previewHeight?: number;
};

const RENDER_TIMEOUT_MS = 20000;

/** Clip speeds count as speed regions where no saved speed region already covers them. */
function withClipSpeeds(settings: ProjectThumbnailSettings): SpeedRegion[] {
	const { clipRegions, speedRegions } = settings;
	const result = [...speedRegions];
	for (const clip of clipRegions) {
		if (clip.speed === 1) continue;
		const startMs = getClipSourceStartMs(clip);
		const endMs = getClipSourceEndMs(clip);
		if (speedRegions.some((region) => region.endMs > startMs && region.startMs < endMs))
			continue;
		result.push({
			id: `clip-speed-${clip.id}`,
			startMs,
			endMs,
			speed: clip.speed as SpeedRegion["speed"],
		});
	}
	return result;
}

/**
 * The project's opening frame as it will export (background, padding, camera, cursor),
 * as a card-sized PNG data URL. Throws when the recording or the renderer is unavailable.
 */
export async function renderProjectThumbnail(
	videoUrl: string,
	settings: ProjectThumbnailSettings,
): Promise<string> {
	const video = document.createElement("video");
	let renderer: FrameRenderer | null = null;
	let frame: VideoFrame | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let expired = false;
	const cleanup = () => {
		frame?.close();
		frame = null;
		renderer?.destroy();
		renderer = null;
		video.onloadeddata = video.onseeked = video.onerror = null;
		video.removeAttribute("src");
		video.load();
	};
	const render = async () => {
		const firstClip = findPreviewClipAtTimelineTime(0, settings.clipRegions);
		const sourceSeconds = firstClip ? getClipSourceStartMs(firstClip) / 1000 : 0;
		video.muted = true;
		video.preload = "auto";
		// The local media server allows any origin; without this its frames would taint the canvas.
		if (/^https?:/i.test(videoUrl) && new URL(videoUrl).origin !== window.location.origin)
			video.crossOrigin = "anonymous";
		await new Promise<void>((resolve, reject) => {
			const finish = (error?: Error) => {
				clearTimeout(decodeTimeout);
				video.onloadeddata = video.onseeked = video.onerror = null;
				error ? reject(error) : resolve();
			};
			const decodeTimeout = window.setTimeout(
				() => finish(new Error("Thumbnail decode timed out")),
				10000,
			);
			video.onerror = () => finish(new Error("Thumbnail source unavailable"));
			video.onloadeddata = () => {
				if (sourceSeconds > 0) {
					video.onseeked = () => finish();
					video.currentTime = sourceSeconds;
				} else finish();
			};
			video.src = videoUrl;
		});
		if (expired) throw new Error("Thumbnail render timed out");
		if (!video.videoWidth || !video.videoHeight)
			throw new Error("Thumbnail source has no frame");
		const sourceTimestampUs = sourceSeconds * 1_000_000;
		// A timeline that opens on a gap starts on the background alone; older projects have no clips.
		if (firstClip || settings.clipRegions.length === 0)
			frame = new VideoFrame(video, { timestamp: sourceTimestampUs });
		const { cursorIdleHide, webcamUrl, previewWidth, previewHeight, ...rest } = settings;
		renderer = new FrameRenderer({
			...rest,
			timelineEffects: true,
			width: PROJECT_THUMBNAIL_WIDTH,
			height: PROJECT_THUMBNAIL_HEIGHT,
			showShadow: settings.shadowIntensity > 0,
			webcamUrl,
			videoWidth: video.videoWidth,
			videoHeight: video.videoHeight,
			speedRegions: withClipSpeeds(settings),
			previewWidth: previewWidth ?? 1920,
			previewHeight: previewHeight ?? 1080,
			cursorIdleHide: cursorIdleHide === true,
		});
		await renderer.initialize();
		if (expired) throw new Error("Thumbnail render timed out");
		await renderer.renderFrame(frame, sourceTimestampUs, sourceTimestampUs, undefined, 0);
		if (expired) throw new Error("Thumbnail render timed out");
		return renderer.getCanvas().toDataURL("image/png");
	};
	try {
		return await Promise.race([
			render(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					expired = true;
					reject(new Error("Thumbnail render timed out"));
				}, RENDER_TIMEOUT_MS);
			}),
		]);
	} finally {
		expired = true;
		clearTimeout(timer);
		cleanup();
	}
}
