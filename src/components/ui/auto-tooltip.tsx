import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Same timing as HeroUI tooltips (--tooltip-delay / --tooltip-close-delay).
const OPEN_DELAY_MS = 1500;
const WARM_WINDOW_MS = 500;
const GAP = 6;
const EDGE = 8;

const CONTROL_SELECTOR =
	'button, [role="button"], [role="radio"], [role="switch"], [role="menuitem"], a[href]';

type Tip = { label: string; anchor: DOMRect };

/** Icon-only controls (no visible text) whose name comes from aria-label, title or aria-labelledby. */
function labelFor(el: HTMLElement): string | null {
	if (el.closest("[data-no-auto-tooltip]")) return null;
	if (el.innerText.trim() !== "") return null;
	// A short fixed tooltip when the accessible name carries item names.
	if (el.dataset.tooltip !== undefined) return el.dataset.tooltip.trim() || null;
	const labelledBy = el.getAttribute("aria-labelledby");
	const fromLabelledBy = labelledBy
		? labelledBy
				.split(/\s+/)
				.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
				.join(" ")
				.trim()
		: "";
	const label =
		el.getAttribute("aria-label")?.trim() ||
		el.dataset.autoTooltipTitle?.trim() ||
		el.getAttribute("title")?.trim() ||
		fromLabelledBy;
	return label || null;
}

function controlFrom(target: EventTarget | null): HTMLElement | null {
	return target instanceof Element ? target.closest<HTMLElement>(CONTROL_SELECTOR) : null;
}

/** Shows a hover tooltip on every icon-only control in the window, so no button is a mystery. */
export function AutoTooltips() {
	const [tip, setTip] = useState<Tip | null>(null);
	const [position, setPosition] = useState<{ x: number; y: number; placement: string } | null>(
		null,
	);
	const tipRef = useRef<HTMLDivElement>(null);
	const current = useRef<HTMLElement | null>(null);
	const timer = useRef<number | undefined>(undefined);
	const lastHiddenAt = useRef(0);
	const showing = useRef(false);

	useEffect(() => {
		const restoreTitle = (el: HTMLElement) => {
			const title = el.dataset.autoTooltipTitle;
			if (title !== undefined) {
				el.setAttribute("title", title);
				delete el.dataset.autoTooltipTitle;
			}
		};
		const hide = () => {
			window.clearTimeout(timer.current);
			if (current.current) restoreTitle(current.current);
			current.current = null;
			if (showing.current) lastHiddenAt.current = Date.now();
			showing.current = false;
			setTip(null);
			setPosition(null);
		};
		const show = (el: HTMLElement) => {
			if (current.current !== el || !el.isConnected) return;
			const label = labelFor(el);
			// Leave controls that already have their own tooltip alone.
			if (!label || document.querySelector('[role="tooltip"]:not([data-auto-tooltip])'))
				return;
			showing.current = true;
			setTip({ label, anchor: el.getBoundingClientRect() });
		};
		const begin = (el: HTMLElement, immediate: boolean) => {
			if (current.current === el) return;
			hide();
			if (!labelFor(el)) return;
			current.current = el;
			// Hide the plain system tooltip so only one appears.
			const title = el.getAttribute("title");
			if (title !== null) {
				el.dataset.autoTooltipTitle = title;
				el.removeAttribute("title");
			}
			const warm = Date.now() - lastHiddenAt.current < WARM_WINDOW_MS;
			if (immediate || warm) show(el);
			else timer.current = window.setTimeout(() => show(el), OPEN_DELAY_MS);
		};

		// Disabled buttons ignore the pointer, so find one under it inside the hovered element.
		const controlAt = (event: PointerEvent) => {
			const direct = controlFrom(event.target);
			if (direct) return direct;
			if (!(event.target instanceof Element)) return null;
			for (const el of event.target.querySelectorAll<HTMLElement>(
				':is(button, [role="button"], [role="radio"], [role="switch"]):is(:disabled, [aria-disabled="true"])',
			)) {
				const r = el.getBoundingClientRect();
				if (
					event.clientX >= r.left &&
					event.clientX <= r.right &&
					event.clientY >= r.top &&
					event.clientY <= r.bottom
				)
					return el;
			}
			return null;
		};
		const onMove = (event: PointerEvent) => {
			if (event.pointerType === "touch") return;
			const el = controlAt(event);
			if (el === current.current) return;
			if (el) {
				begin(el, false);
				return;
			}
			const wasShowing = showing.current;
			hide();
			if (!wasShowing) lastHiddenAt.current = 0;
		};
		const onFocus = (event: FocusEvent) => {
			const el = controlFrom(event.target);
			if (el?.matches(":focus-visible")) begin(el, true);
		};
		const onBlur = () => hide();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape" || !current.current?.matches(":focus-visible")) hide();
		};

		// If a control's own tooltip opens, step aside and leave that control to it.
		const observer = new MutationObserver(() => {
			const own = document.querySelector('[role="tooltip"]:not([data-auto-tooltip])');
			const el = current.current;
			if (own && el && (own.id === el.getAttribute("aria-describedby") || showing.current)) {
				el.dataset.noAutoTooltip = "";
				hide();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		document.addEventListener("pointermove", onMove, true);
		document.documentElement.addEventListener("pointerleave", hide);
		document.addEventListener("pointerdown", hide, true);
		document.addEventListener("focusin", onFocus, true);
		document.addEventListener("focusout", onBlur, true);
		document.addEventListener("keydown", onKey, true);
		window.addEventListener("scroll", hide, true);
		window.addEventListener("blur", hide);
		return () => {
			hide();
			observer.disconnect();
			document.removeEventListener("pointermove", onMove, true);
			document.documentElement.removeEventListener("pointerleave", hide);
			document.removeEventListener("pointerdown", hide, true);
			document.removeEventListener("focusin", onFocus, true);
			document.removeEventListener("focusout", onBlur, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("blur", hide);
		};
	}, []);

	useLayoutEffect(() => {
		const node = tipRef.current;
		if (!tip || !node) return;
		const { width, height } = node.getBoundingClientRect();
		const a = tip.anchor;
		const above = a.top - GAP - height;
		const placement = above >= EDGE ? "top" : "bottom";
		const y = placement === "top" ? above : a.bottom + GAP;
		const centred = a.left + a.width / 2 - width / 2;
		const x = Math.min(Math.max(centred, EDGE), window.innerWidth - width - EDGE);
		setPosition({ x, y, placement });
	}, [tip]);

	if (!tip) return null;
	return createPortal(
		<div
			ref={tipRef}
			role="tooltip"
			data-auto-tooltip=""
			data-placement={position?.placement}
			data-entering={position ? "true" : undefined}
			className="tooltip pointer-events-none fixed z-[2147483647] whitespace-nowrap"
			style={{
				left: position?.x ?? 0,
				top: position?.y ?? 0,
				visibility: position ? "visible" : "hidden",
				wordBreak: "normal",
			}}
		>
			{tip.label}
		</div>,
		document.body,
	);
}
