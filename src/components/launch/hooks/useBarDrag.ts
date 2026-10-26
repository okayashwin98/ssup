import { type RefObject, useEffect } from "react";

// How far the pointer moves, pressed, before a press becomes a drag instead of a click.
const DRAG_THRESHOLD = 4;

type DragPhase = "start" | "move" | "end";

/**
 * Drags the bar's window from anywhere on it, buttons included: a press that moves
 * drags the window, and that press no longer counts as a click.
 */
export function useBarDrag(
	ref: RefObject<HTMLElement | null>,
	send: (phase: DragPhase, screenX: number, screenY: number) => void,
) {
	useEffect(() => {
		const bar = ref.current;
		if (!bar) return;
		let press: { x: number; y: number; id: number } | null = null;
		let dragging = false;
		let swallowClick = false;
		let frame: number | null = null;
		let latest = { x: 0, y: 0 };

		const onDown = (event: PointerEvent) => {
			if (event.button !== 0) return;
			press = { x: event.screenX, y: event.screenY, id: event.pointerId };
			dragging = false;
		};
		const onMove = (event: PointerEvent) => {
			if (!press || event.pointerId !== press.id) return;
			if (!dragging) {
				if (Math.hypot(event.screenX - press.x, event.screenY - press.y) < DRAG_THRESHOLD)
					return;
				dragging = true;
				bar.setPointerCapture(press.id);
				send("start", press.x, press.y);
			}
			latest = { x: event.screenX, y: event.screenY };
			// One window move per frame.
			if (frame === null) {
				frame = requestAnimationFrame(() => {
					frame = null;
					send("move", latest.x, latest.y);
				});
			}
		};
		const onUp = (event: PointerEvent) => {
			if (!press || event.pointerId !== press.id) return;
			if (dragging) {
				if (frame !== null) cancelAnimationFrame(frame);
				frame = null;
				send("move", event.screenX, event.screenY);
				send("end", event.screenX, event.screenY);
				swallowClick = true;
				// A drag that ends off the bar sends no click; don't keep waiting for one.
				setTimeout(() => {
					swallowClick = false;
				}, 0);
			}
			press = null;
			dragging = false;
		};
		// A drag is not a click: stop it before the button's own click handler sees it.
		const onClick = (event: MouseEvent) => {
			if (!swallowClick) return;
			swallowClick = false;
			event.stopPropagation();
			event.preventDefault();
		};

		bar.addEventListener("pointerdown", onDown);
		bar.addEventListener("pointermove", onMove);
		bar.addEventListener("pointerup", onUp);
		bar.addEventListener("pointercancel", onUp);
		bar.addEventListener("click", onClick, true);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			bar.removeEventListener("pointerdown", onDown);
			bar.removeEventListener("pointermove", onMove);
			bar.removeEventListener("pointerup", onUp);
			bar.removeEventListener("pointercancel", onUp);
			bar.removeEventListener("click", onClick, true);
		};
	}, [ref, send]);
}
