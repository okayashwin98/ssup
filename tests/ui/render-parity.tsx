/* Mounts the real editor preview next to single frames from the real export renderers. */
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	type AutoCaptionSettings,
	type AutoCaptionStyle,
	type CaptionCue,
	type CursorStyle,
	DEFAULT_AUTO_CAPTION_SETTINGS,
	type CursorTelemetryPoint,
	DEFAULT_WEBCAM_OVERLAY,
	type WebcamOverlaySettings,
} from "@/components/video-editor/types";
import { applyCaptionPreset } from "@/components/video-editor/captionPresets";
import VideoPlayback, { type VideoPlaybackRef } from "@/components/video-editor/VideoPlayback";
import { I18nProvider } from "@/contexts/I18nContext";
import { FrameRenderer as LegacyFrameRenderer } from "@/lib/exporter/frameRenderer";
import { FrameRenderer as ModernFrameRenderer } from "@/lib/exporter/modernFrameRenderer";
import { ModernVideoExporter } from "@/lib/exporter/modernVideoExporter";
import "@/index.css";

type ParityConfig = {
	video?: string;
	time?: number;
	width?: number;
	wallpaper?: string;
	padding?: number;
	showCursor?: boolean;
	cursorStyle?: CursorStyle;
	cursorSize?: number;
	cursorIdleHide?: boolean;
	cursorClickBounce?: number;
	cursorTelemetry?: CursorTelemetryPoint[];
	webcam?: Partial<WebcamOverlaySettings>;
	webcamVideo?: string;
	captions?: CaptionCue[];
	captionSettings?: Partial<AutoCaptionSettings>;
	captionStyle?: AutoCaptionStyle;
};

const config: ParityConfig = location.hash
	? JSON.parse(decodeURIComponent(location.hash.slice(1)))
	: {};
const videoPath = config.video ?? "/tests/ui/fixtures/filmstrip.mp4";
const webcamVideoPath = config.webcamVideo ?? null;
const webcam: WebcamOverlaySettings = {
	...DEFAULT_WEBCAM_OVERLAY,
	...config.webcam,
	enabled: Boolean(config.webcam && webcamVideoPath),
	sourcePath: webcamVideoPath,
};
const wallpaper = config.wallpaper ?? "#1d4ed8";
const padding = config.padding ?? 20;
const shared = {
	showCursor: config.showCursor ?? false,
	cursorStyle: config.cursorStyle ?? ("tahoe" as CursorStyle),
	cursorSize: config.cursorSize ?? 3,
	cursorSmoothing: 0,
	cursorMotionBlur: 0,
	cursorSway: 0,
	cursorClickBounce: config.cursorClickBounce ?? 1,
	cursorIdleHide: config.cursorIdleHide ?? false,
	cursorTelemetry: config.cursorTelemetry ?? [],
};
const captionProps = config.captions
	? {
			autoCaptions: config.captions,
			autoCaptionSettings: applyCaptionPreset(
				{ ...DEFAULT_AUTO_CAPTION_SETTINGS, enabled: true, ...config.captionSettings },
				config.captionStyle ?? "classic",
			),
		}
	: {};
const clips = [{ id: "clip", startMs: 0, endMs: 6000, speed: 1 }];
const noop = () => undefined;
const noZooms: never[] = [];
const onError = (error: string) => {
	throw new Error(error);
};

function seekVideo(video: HTMLVideoElement, seconds: number) {
	return new Promise<void>((resolve, reject) => {
		const done = () => {
			if (video.readyState < 2) return;
			video.removeEventListener("seeked", done);
			video.removeEventListener("loadeddata", done);
			resolve();
		};
		video.addEventListener("seeked", done);
		video.addEventListener("loadeddata", done);
		video.addEventListener("error", () => reject(new Error("video failed")), { once: true });
		if (video.readyState >= 1) video.currentTime = seconds;
		else
			video.addEventListener(
				"loadedmetadata",
				() => {
					video.currentTime = seconds;
				},
				{ once: true },
			);
	});
}

async function exportFrame(kind: "legacy" | "modern", seconds: number, width = 1280) {
	const height = Math.round((width * 9) / 16);
	const video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	video.src = videoPath;
	await seekVideo(video, Math.max(seconds, 0.001));
	const timestampUs = Math.round(seconds * 1_000_000);
	const frame = new VideoFrame(video, { timestamp: timestampUs });
	const Renderer = kind === "legacy" ? LegacyFrameRenderer : ModernFrameRenderer;
	const renderer = new Renderer({
		width,
		height,
		wallpaper,
		zoomRegions: [],
		showShadow: false,
		shadowIntensity: 0,
		backgroundBlur: 0,
		borderRadius: 0,
		padding,
		cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		webcam,
		webcamUrl: webcam.enabled ? new URL(webcamVideoPath ?? "", location.href).href : null,
		videoWidth: video.videoWidth,
		videoHeight: video.videoHeight,
		...shared,
		...captionProps,
	});
	try {
		await renderer.initialize();
		await renderer.renderFrame(frame, timestampUs, timestampUs, undefined, timestampUs);
		const copy = document.createElement("canvas");
		copy.width = width;
		copy.height = height;
		copy.getContext("2d")?.drawImage(renderer.getCanvas(), 0, 0);
		const url = copy.toDataURL("image/png");
		let image = document.querySelector<HTMLImageElement>(`img[data-export="${kind}"]`);
		if (!image) {
			image = document.createElement("img");
			image.dataset.export = kind;
			image.style.cssText = "display:block;margin-top:8px";
			document.querySelector("main")?.append(image);
		}
		image.style.width = `${document.querySelector("[data-preview]")?.clientWidth ?? width}px`;
		image.src = url;
		await image.decode();
		return url;
	} finally {
		frame.close();
		renderer.destroy();
		video.removeAttribute("src");
		video.load();
	}
}

/** The background the fast native ("Breeze") export is handed for a gradient wallpaper. */
function breezeGradient(width = 1280) {
	const height = Math.round((width * 9) / 16);
	const exporter = new ModernVideoExporter({
		videoUrl: videoPath,
		width,
		height,
		frameRate: 30,
		bitrate: 8_000_000,
		wallpaper,
		padding,
		borderRadius: 0,
		backgroundBlur: 0,
		shadowIntensity: 0,
		showShadow: false,
		cropRegion: { x: 0, y: 0, width: 1, height: 1 },
	} as never) as unknown as {
		createNativeStaticLayoutGradient(
			ctx: CanvasRenderingContext2D,
			wallpaper: string,
		): CanvasGradient | null;
	};
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	const gradient = ctx && exporter.createNativeStaticLayoutGradient(ctx, wallpaper);
	if (!ctx || !gradient) throw new Error("No Breeze gradient");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
	return canvas.toDataURL("image/png");
}

function Parity() {
	const playback = useRef<VideoPlaybackRef>(null);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState(config.time ?? 0);
	const [ready, setReady] = useState(false);
	Object.assign(window, {
		parity: {
			seek: (seconds: number) => playback.current?.seekTimeline(seconds),
			play: () => playback.current?.play(),
			pause: () => playback.current?.pause(),
			exportFrame,
			breezeGradient,
		},
	});
	return (
		<main style={{ width: config.width ?? 900 }} data-ready={ready} data-time={time}>
			<div data-preview>
				<VideoPlayback
					ref={playback}
					videoPath={videoPath}
					clipRegions={clips}
					currentTime={time}
					onTimeUpdate={setTime}
					onDurationChange={noop}
					onPlayStateChange={setPlaying}
					onError={onError}
					onPreviewReadyChange={setReady}
					zoomRegions={noZooms}
					selectedZoomId={null}
					onSelectZoom={noop}
					onZoomFocusChange={noop}
					isPlaying={playing}
					aspectRatio="16:9"
					wallpaper={wallpaper}
					showShadow={false}
					borderRadius={0}
					padding={padding}
					webcam={webcam}
					webcamVideoPath={webcam.enabled ? webcamVideoPath : null}
					{...shared}
					{...captionProps}
				/>
			</div>
		</main>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<I18nProvider>
		<Parity />
	</I18nProvider>,
);
