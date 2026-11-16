import { type RefObject, useLayoutEffect } from "react";

/** Height of the fade, and the scroll distance over which it comes in. */
export const SCROLL_EDGE_FADE_PX = 24;

/** How strongly each edge fades: 0 at that end of the list, 1 once a fade's height away. */
export function scrollEdgeFadeOpacity(
	{
		scrollTop,
		scrollHeight,
		clientHeight,
	}: { scrollTop: number; scrollHeight: number; clientHeight: number },
	size = SCROLL_EDGE_FADE_PX,
) {
	const clamp = (distance: number) => Math.min(1, Math.max(0, distance / size));
	return {
		top: clamp(scrollTop),
		bottom: clamp(scrollHeight - clientHeight - scrollTop),
	};
}

/** Shows the top and bottom fades of a scroller only where more content lies that way. */
export function useScrollEdgeFade(
	scroller: RefObject<HTMLElement | null>,
	topFade: RefObject<HTMLElement | null>,
	bottomFade: RefObject<HTMLElement | null>,
) {
	useLayoutEffect(() => {
		const element = scroller.current;
		if (!element) return;
		const measure = () => {
			const { top, bottom } = scrollEdgeFadeOpacity(element);
			if (topFade.current) topFade.current.style.opacity = String(top);
			if (bottomFade.current) bottomFade.current.style.opacity = String(bottom);
		};
		const resize = new ResizeObserver(measure);
		const observeContents = () => {
			resize.disconnect();
			resize.observe(element);
			for (const child of element.children) resize.observe(child);
			measure();
		};
		const children = new MutationObserver(observeContents);
		children.observe(element, { childList: true });
		observeContents();
		element.addEventListener("scroll", measure, { passive: true });
		return () => {
			resize.disconnect();
			children.disconnect();
			element.removeEventListener("scroll", measure);
		};
	}, [scroller, topFade, bottomFade]);
}
