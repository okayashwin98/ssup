/** One sway, left and right; `.hover-sway` in index.css uses the same length. */
export const SWAY_PERIOD_MS = 889;

/**
 * Starts the hover sway (the `hover-sway` class) in step with every other window's,
 * by the wall clock, so the picker's icon and the bar's mode icon move together.
 */
export function swayPhase() {
	return { animationDelay: `-${Date.now() % SWAY_PERIOD_MS}ms` };
}
