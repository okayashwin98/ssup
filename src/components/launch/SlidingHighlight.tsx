import { useEffect, useRef } from "react";
import styles from "./HudBar.module.css";

// Crossing a gap between buttons can briefly look like leaving the bar (its background
// is a drag area, which hides the pointer from the page), so leaving waits this long.
const LEAVE_GRACE_MS = 200;
// Coming back this soon after it faded counts as moving, not arriving.
const RETURN_GLIDE_MS = 300;

/** Tells the bar's hover fill to let go, e.g. when a native menu closes. */
export function resetSlidingHighlight() {
	window.dispatchEvent(new Event("sliding-highlight-reset"));
}

/**
 * One hover fill for the whole bar: it fades in under the first button the pointer
 * reaches, then glides from button to button, and fades out when the pointer leaves.
 * Place it as the bar's first child.
 */
export function SlidingHighlight() {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const highlight = ref.current;
		const bar = highlight?.parentElement;
		if (!highlight || !bar) return;
		let shown = false;
		let hiddenAt = Number.NEGATIVE_INFINITY;
		let leaveTimer: number | null = null;
		const cancelLeave = () => {
			if (leaveTimer !== null) window.clearTimeout(leaveTimer);
			leaveTimer = null;
		};
		const hide = () => {
			cancelLeave();
			if (!shown) return;
			highlight.removeAttribute("data-shown");
			shown = false;
			hiddenAt = performance.now();
		};
		const onPointer = (event: PointerEvent) => {
			const button = (event.target as HTMLElement).closest("button");
			if (!button || !bar.contains(button) || button.disabled) return;
			cancelLeave();
			// The selected mode, and a button with a hover look of its own, take no fill.
			if (button.hasAttribute("data-active") || button.hasAttribute("data-own-hover")) {
				hide();
				return;
			}
			const box = bar.getBoundingClientRect();
			const rect = button.getBoundingClientRect();
			const transform = `translate(${rect.left - box.left}px, ${rect.top - box.top}px)`;
			if (shown && highlight.style.transform === transform) return;
			// Arriving from outside the bar: appear in place instead of sliding in.
			const glide = shown || performance.now() - hiddenAt < RETURN_GLIDE_MS;
			highlight.toggleAttribute("data-gliding", glide);
			highlight.style.transform = transform;
			highlight.style.width = `${rect.width}px`;
			highlight.style.height = `${rect.height}px`;
			highlight.setAttribute("data-shown", "");
			shown = true;
		};
		const onLeave = () => {
			cancelLeave();
			leaveTimer = window.setTimeout(hide, LEAVE_GRACE_MS);
		};
		bar.addEventListener("pointerover", onPointer);
		bar.addEventListener("pointermove", onPointer);
		bar.addEventListener("pointerleave", onLeave);
		window.addEventListener("sliding-highlight-reset", hide);
		return () => {
			cancelLeave();
			bar.removeEventListener("pointerover", onPointer);
			bar.removeEventListener("pointermove", onPointer);
			bar.removeEventListener("pointerleave", onLeave);
			window.removeEventListener("sliding-highlight-reset", hide);
		};
	}, []);
	return <span ref={ref} className={styles.highlight} aria-hidden="true" />;
}
