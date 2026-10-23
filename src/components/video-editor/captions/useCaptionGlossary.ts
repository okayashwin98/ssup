import { useCallback, useEffect, useRef, useState } from "react";
import {
	loadCaptionGlossary,
	normalizeCaptionGlossary,
	saveCaptionGlossary,
} from "@/lib/captionGlossary";

const SAVE_DELAY_MS = 400;

/** The app-wide glossary, saved shortly after typing stops, on blur and on unmount. */
export function useCaptionGlossary() {
	const [glossary, setGlossary] = useState(loadCaptionGlossary);
	const pending = useRef<string | null>(null);
	const timer = useRef<number | null>(null);

	const flush = useCallback(() => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
		if (pending.current !== null) saveCaptionGlossary(pending.current);
		pending.current = null;
	}, []);

	useEffect(() => {
		// A window closing or reloading doesn't unmount, so save then too.
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [flush]);

	const update = useCallback(
		(value: string) => {
			const next = normalizeCaptionGlossary(value);
			setGlossary(next);
			pending.current = next;
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
		},
		[flush],
	);

	return { glossary, update, flush };
}
