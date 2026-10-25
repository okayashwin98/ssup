import { useEffect, useRef } from "react";
import styles from "./HudBar.module.css";

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
		const onOver = (event: PointerEvent) => {
			const button = (event.target as HTMLElement).closest("button");
			if (!button || !bar.contains(button) || button.disabled) return;
			const box = bar.getBoundingClientRect();
			const rect = button.getBoundingClientRect();
			// Arriving from outside the bar: appear in place instead of sliding in.
			highlight.toggleAttribute("data-gliding", shown);
			highlight.style.transform = `translate(${rect.left - box.left}px, ${rect.top - box.top}px)`;
			highlight.style.width = `${rect.width}px`;
			highlight.style.height = `${rect.height}px`;
			highlight.setAttribute("data-shown", "");
			shown = true;
		};
		const onLeave = () => {
			highlight.removeAttribute("data-shown");
			shown = false;
		};
		bar.addEventListener("pointerover", onOver);
		bar.addEventListener("pointerleave", onLeave);
		return () => {
			bar.removeEventListener("pointerover", onOver);
			bar.removeEventListener("pointerleave", onLeave);
		};
	}, []);
	return <span ref={ref} className={styles.highlight} aria-hidden="true" />;
}
