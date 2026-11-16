import tikTokSansUrl from "@/assets/fonts/tiktok-sans/TikTokSans-Variable.ttf?url";
import { type AutoCaptionSettings, getDefaultCaptionFontFamily } from "./types";

type CaptionFontSettings = Pick<AutoCaptionSettings, "style" | "fontFamily">;

export const TIKTOK_CAPTION_FONT_NAME = "TikTok Sans";

/** The TikTok style owns its typeface; every other style keeps the project's font. */
export function getCaptionFontFamily(settings?: Partial<CaptionFontSettings>) {
	const fallback = settings?.fontFamily || getDefaultCaptionFontFamily();
	return settings?.style === "tiktok" ? `"${TIKTOK_CAPTION_FONT_NAME}", ${fallback}` : fallback;
}

let tikTokFontReady: Promise<void> | undefined;

/** Loads the bundled TikTok Sans the first time that style is used; no network request. */
export function ensureCaptionFontLoaded(settings?: Partial<CaptionFontSettings>): Promise<void> {
	if (settings?.style !== "tiktok") return Promise.resolve();
	if (tikTokFontReady) return tikTokFontReady;
	if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) {
		return Promise.reject(new Error("TikTok Sans needs browser font loading"));
	}
	const fonts = document.fonts;
	tikTokFontReady = (async () => {
		const face = new FontFace(TIKTOK_CAPTION_FONT_NAME, `url("${tikTokSansUrl}")`, {
			style: "normal",
			weight: "300 900",
		});
		fonts.add(await face.load());
	})().catch((error: unknown) => {
		// A failed load can be retried next time.
		tikTokFontReady = undefined;
		throw error;
	});
	return tikTokFontReady;
}
