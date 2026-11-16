import { CAPTION_FONT_WEIGHT } from "./captionStyle";
import {
	type AutoCaptionSettings,
	type AutoCaptionStyle,
	DEFAULT_AUTO_CAPTION_SETTINGS,
} from "./types";

interface CaptionPreset {
	id: AutoCaptionStyle;
	label: string;
	fontWeight: number;
	/** Shown in capitals; the editable caption text keeps its own casing. */
	uppercase?: boolean;
	/** Words appear one by one as they are spoken. */
	revealWords?: boolean;
	/** Dark outline around each letter, as a fraction of the font size. */
	outlineEm: number;
	settings: Pick<
		AutoCaptionSettings,
		"textColor" | "inactiveTextColor" | "backgroundOpacity" | "boxRadius" | "animationStyle"
	>;
}

/** Shared by the editor preview, both export renderers and the style picker. */
export const CAPTION_PRESETS: readonly CaptionPreset[] = [
	{
		id: "classic",
		label: "Classic",
		fontWeight: CAPTION_FONT_WEIGHT,
		outlineEm: 0,
		settings: {
			textColor: DEFAULT_AUTO_CAPTION_SETTINGS.textColor,
			inactiveTextColor: DEFAULT_AUTO_CAPTION_SETTINGS.inactiveTextColor,
			backgroundOpacity: DEFAULT_AUTO_CAPTION_SETTINGS.backgroundOpacity,
			boxRadius: DEFAULT_AUTO_CAPTION_SETTINGS.boxRadius,
			animationStyle: DEFAULT_AUTO_CAPTION_SETTINGS.animationStyle,
		},
	},
	{
		id: "reveal",
		label: "Reveal",
		fontWeight: 400,
		revealWords: true,
		outlineEm: 0,
		settings: {
			textColor: "#FFFFFF",
			inactiveTextColor: "#FFFFFF",
			backgroundOpacity: 1,
			boxRadius: 8,
			animationStyle: "none",
		},
	},
	{
		id: "tiktok",
		label: "TikTok",
		fontWeight: 800,
		uppercase: true,
		outlineEm: 0.14,
		settings: {
			textColor: "#FFFFFF",
			inactiveTextColor: "#FFFFFF",
			backgroundOpacity: 0.78,
			boxRadius: 12,
			animationStyle: "none",
		},
	},
];

export function isAutoCaptionStyle(value: unknown): value is AutoCaptionStyle {
	return CAPTION_PRESETS.some((preset) => preset.id === value);
}

export function getCaptionPreset(style: unknown): CaptionPreset {
	return CAPTION_PRESETS.find((preset) => preset.id === style) ?? CAPTION_PRESETS[0];
}

export function getCaptionFontWeight(style: unknown) {
	return getCaptionPreset(style).fontWeight;
}

/** Casing applied before measuring and drawing; the source text stays as typed. */
export function getCaptionDisplayText(text: string, style: unknown) {
	return getCaptionPreset(style).uppercase ? text.toUpperCase() : text;
}

export function getCaptionOutlineEm(style: unknown) {
	return getCaptionPreset(style).outlineEm;
}

/** Switch style: colours, box and animation follow the style; size and position stay. */
export function applyCaptionPreset(
	settings: AutoCaptionSettings,
	style: AutoCaptionStyle,
): AutoCaptionSettings {
	const preset = getCaptionPreset(style);
	const { style: _previous, ...rest } = settings;
	return {
		...rest,
		...preset.settings,
		...(preset.id === "classic" ? {} : { style: preset.id }),
	};
}

/** Reveal's per-word fade: eased over 140 ms from when the word is spoken. */
export const CAPTION_REVEAL_MS = 140;

export function getCaptionRevealBlurPx(revealProgress: number | undefined, fontSize: number) {
	return revealProgress === undefined ? 0 : (1 - revealProgress) * fontSize * 0.18;
}
