export type AreaRect = { x: number; y: number; width: number; height: number };
export type AreaHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const AREA_HANDLES: AreaHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
/** Matches MIN_CAPTURE_AREA_SIZE in electron/ipc/sourceArea.ts. */
export const MIN_AREA_SIZE = 32;

type Bounds = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/**
 * Puts the origin at the top-left corner when a drag went up or left, and keeps
 * the rectangle inside the overlay.
 */
export function normalizeAreaRect(rect: AreaRect, bounds: Bounds): AreaRect {
	const left = clamp(Math.min(rect.x, rect.x + rect.width), 0, bounds.width);
	const right = clamp(Math.max(rect.x, rect.x + rect.width), 0, bounds.width);
	const top = clamp(Math.min(rect.y, rect.y + rect.height), 0, bounds.height);
	const bottom = clamp(Math.max(rect.y, rect.y + rect.height), 0, bounds.height);
	return {
		x: Math.round(left),
		y: Math.round(top),
		width: Math.round(right - left),
		height: Math.round(bottom - top),
	};
}

/** Moves the rectangle by a drag offset without letting it leave the overlay. */
export function moveAreaRect(rect: AreaRect, dx: number, dy: number, bounds: Bounds): AreaRect {
	return {
		...rect,
		x: clamp(Math.round(rect.x + dx), 0, Math.max(0, bounds.width - rect.width)),
		y: clamp(Math.round(rect.y + dy), 0, Math.max(0, bounds.height - rect.height)),
	};
}

/**
 * Drags one edge or corner; dragging past the opposite edge flips the rectangle.
 * With a `ratio` (width ÷ height) the rectangle keeps that shape instead.
 */
export function resizeAreaRect(
	rect: AreaRect,
	handle: AreaHandle,
	dx: number,
	dy: number,
	bounds: Bounds,
	ratio?: number | null,
): AreaRect {
	if (ratio) return resizeLockedAreaRect(rect, handle, dx, dy, bounds, ratio);
	let left = rect.x;
	let top = rect.y;
	let right = rect.x + rect.width;
	let bottom = rect.y + rect.height;
	if (handle.includes("w")) left += dx;
	if (handle.includes("e")) right += dx;
	if (handle.includes("n")) top += dy;
	if (handle.includes("s")) bottom += dy;
	return normalizeAreaRect(
		{ x: left, y: top, width: right - left, height: bottom - top },
		bounds,
	);
}

export function rectContains(rect: AreaRect, x: number, y: number): boolean {
	return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** The frontmost entry under the point, from a list ordered front to back. */
export function frontmostAt<T extends { rect: AreaRect }>(
	entries: T[],
	x: number,
	y: number,
): T | null {
	return entries.find((entry) => rectContains(entry.rect, x, y)) ?? null;
}

/**
 * A ratio-locked resize: a corner keeps the opposite corner still, an edge keeps the
 * opposite edge still and grows evenly about the centre line. It never leaves the overlay.
 */
function resizeLockedAreaRect(
	rect: AreaRect,
	handle: AreaHandle,
	dx: number,
	dy: number,
	bounds: Bounds,
	ratio: number,
): AreaRect {
	const horizontal = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
	const vertical = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
	// The edges that stay put while dragging, or the centre lines for an edge handle.
	const anchorX =
		horizontal > 0 ? rect.x : horizontal < 0 ? rect.x + rect.width : rect.x + rect.width / 2;
	const anchorY =
		vertical > 0 ? rect.y : vertical < 0 ? rect.y + rect.height : rect.y + rect.height / 2;
	const draggedWidth = rect.width + horizontal * dx;
	const draggedHeight = rect.height + vertical * dy;

	let width: number;
	let height: number;
	if (horizontal && vertical) {
		// A corner follows whichever side the pointer pulled further.
		if (draggedWidth / ratio >= draggedHeight) {
			width = draggedWidth;
			height = width / ratio;
		} else {
			height = draggedHeight;
			width = height * ratio;
		}
	} else if (horizontal) {
		width = draggedWidth;
		height = width / ratio;
	} else {
		height = draggedHeight;
		width = height * ratio;
	}
	if (height < MIN_AREA_SIZE) {
		height = MIN_AREA_SIZE;
		width = height * ratio;
	}
	if (width < MIN_AREA_SIZE) {
		width = MIN_AREA_SIZE;
		height = width / ratio;
	}

	// Room on each axis from the anchor (both ways from a centre line).
	const roomX =
		horizontal > 0
			? bounds.width - anchorX
			: horizontal < 0
				? anchorX
				: 2 * Math.min(anchorX, bounds.width - anchorX);
	const roomY =
		vertical > 0
			? bounds.height - anchorY
			: vertical < 0
				? anchorY
				: 2 * Math.min(anchorY, bounds.height - anchorY);
	const fit = Math.min(1, roomX / width, roomY / height);
	width *= fit;
	height *= fit;

	const x = horizontal > 0 ? anchorX : horizontal < 0 ? anchorX - width : anchorX - width / 2;
	const y = vertical > 0 ? anchorY : vertical < 0 ? anchorY - height : anchorY - height / 2;
	return {
		x: Math.round(x),
		y: Math.round(y),
		width: Math.round(width),
		height: Math.round(height),
	};
}
