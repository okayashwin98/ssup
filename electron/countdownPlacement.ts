type Rect = { x: number; y: number; width: number; height: number };
type DisplayLike = { id: number; workArea: Rect };

/**
 * Centres the countdown on the display being recorded (screen, window or area),
 * falling back to the primary display when the source's display is unknown.
 */
export function getCountdownWindowBounds(
	displays: DisplayLike[],
	primary: DisplayLike,
	sourceDisplayId: string | undefined,
	size: number,
): Rect {
	const display = displays.find((item) => String(item.id) === sourceDisplayId) ?? primary;
	const { workArea } = display;
	return {
		x: Math.floor(workArea.x + (workArea.width - size) / 2),
		y: Math.floor(workArea.y + (workArea.height - size) / 2),
		width: size,
		height: size,
	};
}
