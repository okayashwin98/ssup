import { loadAppSetting, saveAppSetting } from "./appSettings";

/** One glossary for every project's captions and for shared-link subtitles. */
export const CAPTION_GLOSSARY_SETTING = "supershare.captionGlossary";
export const MAX_CAPTION_GLOSSARY_LENGTH = 1000;

export function normalizeCaptionGlossary(value: unknown): string {
	return typeof value === "string" ? value.slice(0, MAX_CAPTION_GLOSSARY_LENGTH) : "";
}

export function loadCaptionGlossary(): string {
	return normalizeCaptionGlossary(loadAppSetting<string>(CAPTION_GLOSSARY_SETTING));
}

export function saveCaptionGlossary(value: string): boolean {
	return saveAppSetting(CAPTION_GLOSSARY_SETTING, normalizeCaptionGlossary(value));
}
