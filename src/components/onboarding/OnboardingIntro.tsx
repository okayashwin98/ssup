import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./OnboardingIntro.module.css";

/** Icon and wordmark settle by ~0.9 s, hold, then the intro fades out by ~2.1 s. */
const HOLD_MS = 1700;
const LEAVE_MS = 420;
const QUICK_LEAVE_MS = 180;
const REDUCED_HOLD_MS = 900;

/**
 * The first-launch reveal of SuperShare's icon and wordmark. It covers the window while the
 * permissions welcome is already open (and checking access) underneath, then fades away to
 * show it. A click or Escape skips it.
 */
export function OnboardingIntro({ onDone }: { onDone: () => void }) {
	const [reducedMotion] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
	);
	const [phase, setPhase] = useState<"showing" | "leaving">("showing");
	const [quick, setQuick] = useState(false);
	const done = useRef(onDone);
	done.current = onDone;
	const leaving = useRef(false);

	useEffect(() => {
		let finish: ReturnType<typeof setTimeout> | undefined;
		const leave = (fast: boolean) => {
			if (leaving.current) return;
			leaving.current = true;
			setQuick(fast);
			setPhase("leaving");
			finish = setTimeout(() => done.current(), fast ? QUICK_LEAVE_MS : LEAVE_MS);
		};
		const hold = setTimeout(
			() => leave(reducedMotion),
			reducedMotion ? REDUCED_HOLD_MS : HOLD_MS,
		);
		// Listen before anything else so a skip never reaches the welcome underneath.
		const swallow = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
		};
		const skipOnPointer = (event: Event) => {
			swallow(event);
			leave(true);
		};
		const skipOnKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") return;
			swallow(event);
			leave(true);
		};
		window.addEventListener("pointerdown", skipOnPointer, true);
		window.addEventListener("mousedown", swallow, true);
		window.addEventListener("pointerup", swallow, true);
		window.addEventListener("mouseup", swallow, true);
		window.addEventListener("click", swallow, true);
		window.addEventListener("keydown", skipOnKey, true);
		return () => {
			clearTimeout(hold);
			clearTimeout(finish);
			window.removeEventListener("pointerdown", skipOnPointer, true);
			window.removeEventListener("mousedown", swallow, true);
			window.removeEventListener("pointerup", swallow, true);
			window.removeEventListener("mouseup", swallow, true);
			window.removeEventListener("click", swallow, true);
			window.removeEventListener("keydown", skipOnKey, true);
		};
	}, [reducedMotion]);

	return createPortal(
		<div
			className={styles.intro}
			data-onboarding-intro
			data-phase={phase}
			data-quick={quick || undefined}
			data-reduced-motion={reducedMotion || undefined}
			aria-hidden="true"
		>
			<div className={styles.lockup}>
				{/* Relative, so it also loads from the packaged app's files. */}
				<img
					className={styles.icon}
					src="app-icons/recordlymac-512.png"
					alt=""
					draggable={false}
				/>
				<span className={styles.wordmark}>SuperShare</span>
			</div>
		</div>,
		document.body,
	);
}
