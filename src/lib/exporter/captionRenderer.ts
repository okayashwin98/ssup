import { getCaptionFontFamily } from "@/components/video-editor/captionFonts";
import {
	buildActiveCaptionLayout,
	type CaptionWordLayout,
} from "@/components/video-editor/captionLayout";
import {
	getCaptionDisplayText,
	getCaptionFontWeight,
	getCaptionOutlineEm,
	getCaptionRevealBlurPx,
} from "@/components/video-editor/captionPresets";
import {
	CAPTION_LINE_HEIGHT,
	getCaptionPadding,
	getCaptionScaledFontSize,
	getCaptionScaledRadius,
	getCaptionTextMaxWidth,
	getCaptionWordVisualState,
} from "@/components/video-editor/captionStyle";
import type { AutoCaptionSettings, CaptionCue } from "@/components/video-editor/types";
import { drawSquircleOnCanvas } from "@/lib/geometry/squircle";

/** Draw the active caption using the same typography and timing as preview. */
export function renderCaptions(
	ctx: CanvasRenderingContext2D,
	cues: CaptionCue[],
	settings: AutoCaptionSettings,
	width: number,
	height: number,
	timeMs: number,
) {
	if (!settings.enabled || cues.length === 0) {
		return;
	}

	ctx.save();

	const fontSize = getCaptionScaledFontSize(settings.fontSize, width, settings.maxWidth);
	ctx.font = `${getCaptionFontWeight(settings.style)} ${fontSize}px ${getCaptionFontFamily(settings)}`;
	const padding = getCaptionPadding(fontSize);

	const activeCaptionLayout = buildActiveCaptionLayout({
		cues,
		timeMs,
		settings,
		maxWidthPx: getCaptionTextMaxWidth(width, settings.maxWidth, fontSize),
		measureText: (text) => ctx.measureText(text).width,
	});
	if (!activeCaptionLayout) {
		ctx.restore();
		return;
	}

	const lineHeight = fontSize * CAPTION_LINE_HEIGHT;
	const paddingX = padding.x;
	const paddingY = padding.y;
	const textBlockHeight = activeCaptionLayout.visibleLines.length * lineHeight;
	const boxHeight = textBlockHeight + paddingY * 2;
	const centerX = width / 2;
	const centerY = height - (height * settings.bottomOffset) / 100 - boxHeight / 2;
	const maxMeasuredWidth = activeCaptionLayout.visibleLines.reduce(
		(largest, line) => Math.max(largest, line.width),
		0,
	);
	const boxWidth = Math.min(
		width * (settings.maxWidth / 100) + paddingX * 2,
		maxMeasuredWidth + paddingX * 2,
	);

	ctx.translate(centerX, centerY + activeCaptionLayout.translateY);
	ctx.scale(activeCaptionLayout.scale, activeCaptionLayout.scale);
	ctx.globalAlpha = activeCaptionLayout.opacity;

	ctx.fillStyle = `rgba(0, 0, 0, ${settings.backgroundOpacity})`;
	drawSquircleOnCanvas(ctx, {
		x: -boxWidth / 2,
		y: -boxHeight / 2,
		width: boxWidth,
		height: boxHeight,
		radius: getCaptionScaledRadius(settings.boxRadius, fontSize),
	});
	ctx.fill();

	ctx.textAlign = "left";
	ctx.textBaseline = "middle";

	activeCaptionLayout.visibleLines.forEach((line, lineIndex) => {
		let cursorX = -line.width / 2;
		const lineY = -boxHeight / 2 + paddingY + lineHeight * lineIndex + lineHeight / 2;

		line.words.forEach((word) => {
			const visualState = getCaptionWordVisualState(
				activeCaptionLayout.hasWordTimings,
				word.state,
			);
			cursorX += drawCaptionWord(ctx, {
				word,
				settings,
				fontSize,
				x: cursorX,
				y: lineY,
				color: visualState.isInactive ? settings.inactiveTextColor : settings.textColor,
				alpha: activeCaptionLayout.opacity * visualState.opacity,
			});
		});
	});

	ctx.restore();
}

/**
 * One caption word, shared by both export renderers so they match the preview: the style's
 * casing, its dark outline (stroke under the fill, like CSS paint-order) and Reveal's fade-in.
 * `y` is the middle of the line. Returns the advance width.
 */
export function drawCaptionWord(
	ctx: CanvasRenderingContext2D,
	options: {
		word: CaptionWordLayout;
		settings: AutoCaptionSettings;
		fontSize: number;
		x: number;
		y: number;
		color: string;
		alpha: number;
	},
) {
	const { word, settings, fontSize } = options;
	const segmentText = `${word.leadingSpace ? " " : ""}${getCaptionDisplayText(word.text, settings.style)}`;
	const metrics = ctx.measureText(segmentText);
	const outlineEm = getCaptionOutlineEm(settings.style);
	const lineHeight = fontSize * CAPTION_LINE_HEIGHT;
	const baseline = getPreviewCaptionBaseline(ctx.font, lineHeight);

	ctx.save();
	if (baseline === null) {
		ctx.translate(options.x, options.y);
	} else {
		ctx.translate(options.x, options.y - lineHeight / 2 + baseline);
		ctx.textBaseline = "alphabetic";
	}
	ctx.fillStyle = options.color;
	ctx.globalAlpha = options.alpha;
	if (word.revealProgress !== undefined) {
		ctx.globalAlpha *= word.revealProgress;
		const blur = getCaptionRevealBlurPx(word.revealProgress, fontSize);
		if (blur > 0) ctx.filter = `blur(${blur}px)`;
	}
	if (outlineEm > 0) {
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = fontSize * outlineEm;
		ctx.lineJoin = "round";
		ctx.strokeText(segmentText, 0, 0);
	}
	ctx.fillText(segmentText, 0, 0);
	ctx.restore();

	return metrics.width;
}

const previewBaselineCache = new Map<string, number>();

/**
 * Where the editor preview puts the text baseline inside one caption line, read from the
 * browser's own layout of that font, so exported captions sit at exactly the same height.
 * Null when there is no document to measure in.
 */
function getPreviewCaptionBaseline(font: string, lineHeight: number): number | null {
	if (typeof document === "undefined" || !document.body) return null;
	const key = `${font}|${lineHeight}`;
	const cached = previewBaselineCache.get(key);
	if (cached !== undefined) return cached;
	const line = document.createElement("div");
	line.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;font:${font};line-height:${lineHeight}px`;
	const marker = document.createElement("span");
	marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
	line.append(document.createTextNode("Hg"), marker);
	document.body.append(line);
	const baseline = marker.getBoundingClientRect().bottom - line.getBoundingClientRect().top;
	line.remove();
	if (!Number.isFinite(baseline) || baseline <= 0) return null;
	previewBaselineCache.set(key, baseline);
	return baseline;
}
