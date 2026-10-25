/**
 * Starts the hover sway (the `hover-sway` class) in step with every other window's,
 * by the wall clock, so the picker's icon and the bar's Window icon move together.
 */
export function swayPhase() {
	return { animationDelay: `-${Date.now() % 1600}ms` };
}
