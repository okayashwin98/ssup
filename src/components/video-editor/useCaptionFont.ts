import { useEffect, useState } from "react";
import { ensureCaptionFontLoaded, getCaptionFontFamily } from "./captionFonts";
import type { AutoCaptionSettings } from "./types";

/** The caption font family, and whether it is ready to measure and draw. */
export function useCaptionFont(
	settings?: Partial<Pick<AutoCaptionSettings, "style" | "fontFamily">>,
) {
	const fontFamily = getCaptionFontFamily(settings);
	const needsBundledFont = settings?.style === "tiktok";
	const [readyFamily, setReadyFamily] = useState<string | null>(null);
	useEffect(() => {
		if (!needsBundledFont) return;
		let active = true;
		void ensureCaptionFontLoaded({ style: "tiktok" })
			.then(() => {
				if (active) setReadyFamily(fontFamily);
			})
			.catch((error: unknown) => console.warn("Unable to load bundled caption font", error));
		return () => {
			active = false;
		};
	}, [fontFamily, needsBundledFont]);
	return { fontFamily, ready: !needsBundledFont || readyFamily === fontFamily };
}
