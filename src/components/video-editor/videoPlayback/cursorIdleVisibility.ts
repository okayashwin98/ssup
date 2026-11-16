import type { CursorTelemetryPoint } from "../types";

/** New projects hide an idle cursor; projects saved before the setting keep it visible. */
export const DEFAULT_CURSOR_IDLE_HIDE = true;

export const CURSOR_IDLE_THRESHOLD_MS = 2000;
export const CURSOR_IDLE_FADE_DELAY_MS = 500;
export const CURSOR_IDLE_FADE_DURATION_MS = 300;
export const CURSOR_IDLE_FADE_IN_MS = 150;
/** Jitter allowance, measured on a 1920×1080 reference frame. */
export const CURSOR_IDLE_MOVEMENT_TOLERANCE_PX = 2;

type IdleInterval = { startMs: number; endMs: number };
type IdleIndex = { length: number; intervals: IdleInterval[] };
const indexes = new WeakMap<CursorTelemetryPoint[], IdleIndex>();

function isPress(sample: CursorTelemetryPoint) {
	return (
		sample.interactionType === "click" ||
		sample.interactionType === "double-click" ||
		sample.interactionType === "right-click" ||
		sample.interactionType === "middle-click"
	);
}

/**
 * Pauses of at least two seconds, found once per telemetry array. A click that is
 * followed by a release counts as held (a drag) until that release; a click with
 * no recorded release is a single pulse.
 */
export function getCursorIdleIntervals(samples: CursorTelemetryPoint[]): IdleInterval[] {
	if (samples.length < 2) return [];
	const cached = indexes.get(samples);
	if (cached?.length === samples.length) return cached.intervals;

	const heldDowns = new Set<CursorTelemetryPoint>();
	let pendingDown: CursorTelemetryPoint | null = null;
	for (const sample of samples) {
		if (isPress(sample)) pendingDown = sample;
		else if (sample.interactionType === "mouseup" && pendingDown) {
			heldDowns.add(pendingDown);
			pendingDown = null;
		}
	}

	const intervals: IdleInterval[] = [];
	let anchor = samples[0];
	let startMs = anchor.timeMs;
	let held = false;
	const close = (endMs: number) => {
		if (endMs - startMs >= CURSOR_IDLE_THRESHOLD_MS) intervals.push({ startMs, endMs });
	};
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		const wasHeld = held;
		if (heldDowns.has(sample)) held = true;
		if (sample.interactionType === "mouseup") held = false;
		const interaction = Boolean(sample.interactionType && sample.interactionType !== "move");
		// Compare with the last activity position, not the preceding sample:
		// gradual movement must accumulate rather than being mistaken for jitter.
		const moved =
			Math.hypot((sample.cx - anchor.cx) * 1920, (sample.cy - anchor.cy) * 1080) >
			CURSOR_IDLE_MOVEMENT_TOLERANCE_PX;
		if (moved || interaction || held) {
			if (!wasHeld) close(interaction ? sample.timeMs : samples[Math.max(0, i - 1)].timeMs);
			anchor = sample;
			startMs = sample.timeMs;
		}
	}
	const endMs = samples[samples.length - 1].timeMs;
	if (endMs - startMs >= CURSOR_IDLE_THRESHOLD_MS) {
		intervals.push({ startMs, endMs: Number.POSITIVE_INFINITY });
	}
	indexes.set(samples, { length: samples.length, intervals });
	return intervals;
}

function smoothstep(value: number) {
	const progress = Math.min(1, Math.max(0, value));
	return progress * progress * (3 - 2 * progress);
}

/**
 * Cursor opacity (0–1) at a media time. It depends only on the telemetry and the
 * time, so the preview, a seek and every export frame give the same answer.
 */
export function getCursorIdleOpacity(samples: CursorTelemetryPoint[], timeMs: number): number {
	const intervals = getCursorIdleIntervals(samples);
	let lo = 0;
	let hi = intervals.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (intervals[mid].startMs <= timeMs) lo = mid + 1;
		else hi = mid;
	}
	const idle = intervals[lo - 1];
	if (!idle) return 1;
	const intervalOpacity = (interval: IdleInterval) => {
		const hidden = smoothstep(
			(Math.min(timeMs, interval.endMs) - interval.startMs - CURSOR_IDLE_FADE_DELAY_MS) /
				CURSOR_IDLE_FADE_DURATION_MS,
		);
		const revealed = smoothstep((timeMs - interval.endMs) / CURSOR_IDLE_FADE_IN_MS);
		return 1 - hidden * (1 - revealed);
	};
	// A second pause may begin while the cursor is still fading back in.
	const previous = intervals[lo - 2];
	return intervalOpacity(idle) * (previous ? intervalOpacity(previous) : 1);
}
