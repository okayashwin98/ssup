export const ASPECT_RATIOS = [
	"native",
	"16:9",
	"9:16",
	"1:1",
	"4:3",
	"4:5",
	"16:10",
	"10:16",
] as const;

type PresetAspectRatio = (typeof ASPECT_RATIOS)[number];
type CustomAspectRatio = `${number}:${number}`;

export type AspectRatio = PresetAspectRatio | CustomAspectRatio;

const CUSTOM_ASPECT_RATIO_REGEX = /^(\d+):(\d+)$/;

export function isCustomAspectRatio(aspectRatio: string): aspectRatio is CustomAspectRatio {
	if ((ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) {
		return false;
	}
	const match = aspectRatio.match(CUSTOM_ASPECT_RATIO_REGEX);
	if (!match) {
		return false;
	}
	const width = Number(match[1]);
	const height = Number(match[2]);
	return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

function parseCustomAspectRatioValue(aspectRatio: string): number | null {
	if (!isCustomAspectRatio(aspectRatio)) {
		return null;
	}
	const [widthText, heightText] = aspectRatio.split(":");
	const width = Number(widthText);
	const height = Number(heightText);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}
	return width / height;
}

/**
 * Returns the numeric value of an aspect ratio.
 * Uses exhaustive type checking to ensure all AspectRatio cases are handled.
 * If TypeScript errors here, a new ratio was added to the type but not handled.
 */
export function getAspectRatioValue(aspectRatio: AspectRatio, nativeAspectRatio = 16 / 9): number {
	switch (aspectRatio) {
		case "native":
			return nativeAspectRatio > 0 ? nativeAspectRatio : 16 / 9;
		case "16:9":
			return 16 / 9;
		case "9:16":
			return 9 / 16;
		case "1:1":
			return 1;
		case "4:3":
			return 4 / 3;
		case "4:5":
			return 4 / 5;
		case "16:10":
			return 16 / 10;
		case "10:16":
			return 10 / 16;
		default:
			return parseCustomAspectRatioValue(aspectRatio) ?? 16 / 9;
	}
}

export function getAspectRatioDimensions(
	aspectRatio: AspectRatio,
	baseWidth: number,
	nativeAspectRatio?: number,
): { width: number; height: number } {
	const ratio = getAspectRatioValue(aspectRatio, nativeAspectRatio);
	return {
		width: baseWidth,
		height: baseWidth / ratio,
	};
}

export function getAspectRatioLabel(aspectRatio: AspectRatio): string {
	if (aspectRatio === "native") {
		return "Native";
	}
	if (isCustomAspectRatio(aspectRatio)) {
		return `Custom ${aspectRatio}`;
	}
	return aspectRatio;
}

export function formatAspectRatioForCSS(
	aspectRatio: AspectRatio,
	nativeAspectRatio = 16 / 9,
): string {
	if (aspectRatio === "native") {
		return `${nativeAspectRatio > 0 ? nativeAspectRatio : 16 / 9}`;
	}
	return aspectRatio.replace(":", "/");
}

/** Smallest and largest side accepted for a typed custom frame size, in pixels. */
export const CUSTOM_SIZE_MIN = 128;
export const CUSTOM_SIZE_MAX = 7680;

function parseCustomSide(text: string): number | null {
	if (!/^\d+$/.test(text.trim())) return null;
	const side = Number(text.trim());
	return side >= CUSTOM_SIZE_MIN && side <= CUSTOM_SIZE_MAX ? side : null;
}

export function isValidCustomSide(text: string): boolean {
	return parseCustomSide(text) !== null;
}

/** A typed width and height as a saved ratio, or null unless both are whole pixels in range. */
export function customSizeToAspectRatio(widthText: string, heightText: string): AspectRatio | null {
	const width = parseCustomSide(widthText);
	const height = parseCustomSide(heightText);
	return width === null || height === null ? null : `${width}:${height}`;
}

/** The typed size behind a saved ratio, when it was entered as a width and height. */
export function getCustomSize(aspectRatio: AspectRatio): { width: number; height: number } | null {
	const [widthText, heightText, extra] = aspectRatio.split(":");
	if (
		extra !== undefined ||
		customSizeToAspectRatio(widthText ?? "", heightText ?? "") === null
	) {
		return null;
	}
	return { width: Number(widthText), height: Number(heightText) };
}

/** Short name for the picker button: "Native", a typed size as "1280 × 720", else the ratio. */
export function getAspectRatioShortLabel(aspectRatio: AspectRatio): string {
	if (aspectRatio === "native") return "Native";
	const size = getCustomSize(aspectRatio);
	return size ? `${size.width} × ${size.height}` : aspectRatio;
}

/** The frame size a ratio gives for a source video: the long side is kept, as export does. */
export function getAspectRatioFrameSize(
	aspectRatio: AspectRatio,
	sourceWidth: number,
	sourceHeight: number,
): { width: number; height: number } {
	const width = sourceWidth > 0 ? sourceWidth : 1920;
	const height = sourceHeight > 0 ? sourceHeight : 1080;
	if (aspectRatio === "native") return { width, height };
	const size = getCustomSize(aspectRatio);
	if (size) return size;
	const ratio = getAspectRatioValue(aspectRatio, width / height);
	const longSide = Math.max(width, height);
	return {
		width: Math.round(longSide * Math.min(1, ratio)),
		height: Math.round(longSide / Math.max(1, ratio)),
	};
}
