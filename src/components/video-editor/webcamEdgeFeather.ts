import { drawSquircleOnCanvas } from "@/lib/geometry/squircle";
import type { WebcamOverlaySettings } from "./types";
import { scaleWebcamOverlayPixels } from "./webcamOverlay";

export type WebcamEdgeStyle = NonNullable<WebcamOverlaySettings["previewFrame"]>;
/** New projects start with soft edges; a project without the setting keeps the standard edge. */
export const DEFAULT_NEW_PROJECT_WEBCAM_EDGE: WebcamEdgeStyle = "soft-blur";

export function normalizeWebcamEdgeStyle(value: unknown): WebcamEdgeStyle | undefined {
	return value === "standard" || value === "soft-blur" ? value : undefined;
}

/** Keeps the soft border the same size relative to the scene in preview and export. */
export function getWebcamEdgeFeatherPixels(
	edge: WebcamOverlaySettings["previewFrame"],
	viewportWidth: number,
): number {
	return edge === "soft-blur" ? scaleWebcamOverlayPixels(16, viewportWidth) : 0;
}

export interface WebcamContour {
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}

export type TraceWebcamContour = (ctx: CanvasRenderingContext2D, contour: WebcamContour) => void;

const traceSquircle: TraceWebcamContour = (ctx, contour) => drawSquircleOnCanvas(ctx, contour);

/** Blends a blurred perimeter into the sharp centre, then fades its alpha to the edge. */
export class WebcamEdgeFeather {
	private source: HTMLCanvasElement | null = null;
	private mask: HTMLCanvasElement | null = null;

	destroy() {
		for (const canvas of [this.source, this.mask]) {
			if (canvas) {
				canvas.width = 0;
				canvas.height = 0;
			}
		}
		this.source = null;
		this.mask = null;
	}

	apply(
		canvas: HTMLCanvasElement,
		contour: WebcamContour,
		featherPixels: number,
		trace: TraceWebcamContour = traceSquircle,
	) {
		const inset = Math.min(featherPixels, contour.width / 8, contour.height / 8);
		if (!Number.isFinite(inset) || inset <= 0) return;
		this.source ??= document.createElement("canvas");
		this.mask ??= document.createElement("canvas");
		for (const scratch of [this.source, this.mask]) {
			if (scratch.width !== canvas.width) scratch.width = canvas.width;
			if (scratch.height !== canvas.height) scratch.height = canvas.height;
		}
		const output = canvas.getContext("2d");
		const source = this.source.getContext("2d");
		const mask = this.mask.getContext("2d");
		if (!output || !source || !mask) return;
		const blur = `blur(${(inset * 3) / 8}px)`;
		const drawMask = (distance: number) => {
			mask.setTransform(1, 0, 0, 1, 0, 0);
			mask.clearRect(0, 0, canvas.width, canvas.height);
			mask.save();
			mask.filter = blur;
			mask.fillStyle = "white";
			trace(mask, {
				x: contour.x + distance,
				y: contour.y + distance,
				width: contour.width - distance * 2,
				height: contour.height - distance * 2,
				radius: Math.max(0, contour.radius - distance),
			});
			mask.fill();
			mask.restore();
		};

		output.save();
		output.setTransform(1, 0, 0, 1, 0, 0);
		source.setTransform(1, 0, 0, 1, 0, 0);
		source.clearRect(0, 0, canvas.width, canvas.height);
		source.drawImage(canvas, 0, 0);
		output.clearRect(0, 0, canvas.width, canvas.height);
		output.filter = blur;
		output.drawImage(this.source, 0, 0);
		output.filter = "none";

		// Keep the original pixels in the centre instead of blurring the whole camera.
		drawMask(inset * 2);
		source.save();
		source.globalCompositeOperation = "destination-in";
		source.drawImage(this.mask, 0, 0);
		source.restore();
		output.drawImage(this.source, 0, 0);

		drawMask(inset);
		output.globalCompositeOperation = "destination-in";
		output.drawImage(this.mask, 0, 0);
		output.restore();
	}
}

export interface WebcamBubbleDraw {
	source: CanvasImageSource | VideoFrame;
	/** Source rectangle (already cropped) to cover the bubble with. */
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	width: number;
	height: number;
	radius: number;
	mirror: boolean;
	/** Soft border width in layout pixels; zero draws the standard sharp edge. */
	featherPx: number;
	/** Canvas pixels per layout pixel (the preview uses the display's pixel ratio). */
	scale?: number;
	trace?: TraceWebcamContour;
}

/**
 * Draws the clipped webcam into its own canvas. The editor preview (soft edges) and both
 * export renderers use this, so the edge looks the same everywhere.
 */
export function drawWebcamBubble(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	feather: WebcamEdgeFeather,
	draw: WebcamBubbleDraw,
) {
	const scale = draw.scale && draw.scale > 0 ? draw.scale : 1;
	const trace = draw.trace ?? traceSquircle;
	const canvasWidth = Math.max(1, Math.ceil(draw.width * scale));
	const canvasHeight = Math.max(1, Math.ceil(draw.height * scale));
	if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	const coverScale = Math.max(draw.width / draw.sw, draw.height / draw.sh);
	const drawWidth = draw.sw * coverScale;
	const drawHeight = draw.sh * coverScale;
	const drawX = (draw.width - drawWidth) / 2;
	const drawY = (draw.height - drawHeight) / 2;

	ctx.save();
	if (scale !== 1) ctx.scale(scale, scale);
	trace(ctx, { x: 0, y: 0, width: draw.width, height: draw.height, radius: draw.radius });
	ctx.clip();
	if (draw.mirror) {
		ctx.translate(draw.width, 0);
		ctx.scale(-1, 1);
	}
	ctx.drawImage(
		draw.source as CanvasImageSource,
		draw.sx,
		draw.sy,
		draw.sw,
		draw.sh,
		drawX,
		drawY,
		drawWidth,
		drawHeight,
	);
	ctx.restore();

	if (draw.featherPx > 0) {
		feather.apply(
			canvas,
			{
				x: 0,
				y: 0,
				width: draw.width * scale,
				height: draw.height * scale,
				radius: draw.radius * scale,
			},
			draw.featherPx * scale,
			trace,
		);
	}
}
