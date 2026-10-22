/** Video time, in ms, that the helper reports for a resume, or null if it gave none. */
export function parseNativeResumeVideoMs(output: string): number | null {
	const match = /Recording resumed at (\d+(?:\.\d+)?)/.exec(output);
	return match ? Math.round(Number(match[1]) * 1000) : null;
}

/** Cursor clock origin: the wall-clock moment the video was at time zero, if known and fresh. */
export function resolveCursorCaptureStartMs(
	anchor: { wallMs: number; videoMs: number } | null,
	nowMs: number,
): number {
	if (!anchor || nowMs - anchor.wallMs > 30_000 || anchor.wallMs > nowMs) return nowMs;
	return anchor.wallMs - anchor.videoMs;
}
