import type { Graphics } from "pixi.js";
import {
	drawSquircleOnCanvas,
	drawSquircleOnGraphics,
	getSquircleSvgPath,
} from "@/lib/geometry/squircle";
import type { WebcamOverlaySettings, WebcamShape } from "./types";
import type { TraceWebcamContour, WebcamContour } from "./webcamEdgeFeather";
import { getWebcamCornerRadiusPx } from "./webcamOverlay";

export function normalizeWebcamShape(value: unknown): WebcamShape | undefined {
	return value === "circle" || value === "squircle" || value === "rectangle" ? value : undefined;
}

/** A webcam without a shape (every project saved before the choice existed) is a squircle. */
function usesCircularArcs(shape: WebcamShape | undefined) {
	return shape === "circle" || shape === "rectangle";
}

/** A circle is always as tall as it is wide; other shapes keep their own height. */
export function getWebcamShapeHeightPercent(
	shape: WebcamShape | undefined,
	widthPercent: number,
	heightPercent: number,
): number {
	return shape === "circle" ? widthPercent : heightPercent;
}

/** A circle ignores the roundness slider; squircle and rectangle use it. */
export function getWebcamShapeRadiusPx(
	webcam: Pick<WebcamOverlaySettings, "shape" | "roundness">,
	defaultRoundness: number,
	width: number,
	height: number,
): number {
	if (webcam.shape === "circle") return Math.max(0, Math.min(width, height)) / 2;
	return getWebcamCornerRadiusPx(webcam.roundness ?? defaultRoundness, width, height);
}

function clampRadius(contour: WebcamContour) {
	return Math.max(0, Math.min(contour.radius, contour.width / 2, contour.height / 2));
}

/** Canvas outline for the shape; callers fill or clip it. */
export function getWebcamShapeTracer(shape: WebcamShape | undefined): TraceWebcamContour {
	if (!usesCircularArcs(shape)) return (ctx, contour) => drawSquircleOnCanvas(ctx, contour);
	return (ctx, contour) => {
		const { x, y, width, height } = contour;
		if (width <= 0 || height <= 0) return;
		const r = clampRadius(contour);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + width, y, x + width, y + height, r);
		ctx.arcTo(x + width, y + height, x, y + height, r);
		ctx.arcTo(x, y + height, x, y, r);
		ctx.arcTo(x, y, x + width, y, r);
		ctx.closePath();
	};
}

/** The same outline as an SVG path, for the editor preview's clip. */
export function getWebcamShapeSvgPath(shape: WebcamShape | undefined, contour: WebcamContour) {
	if (!usesCircularArcs(shape)) return getSquircleSvgPath(contour);
	const { x, y, width, height } = contour;
	const r = clampRadius(contour);
	return `M ${x + r} ${y} H ${x + width - r} A ${r} ${r} 0 0 1 ${x + width} ${y + r} V ${y + height - r} A ${r} ${r} 0 0 1 ${x + width - r} ${y + height} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + height - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/** The same outline for a Pixi mask. */
export function drawWebcamShapeOnGraphics(
	graphics: Graphics,
	shape: WebcamShape | undefined,
	contour: WebcamContour,
) {
	if (!usesCircularArcs(shape)) {
		drawSquircleOnGraphics(graphics, contour);
		return;
	}
	graphics.roundRect(contour.x, contour.y, contour.width, contour.height, clampRadius(contour));
}
