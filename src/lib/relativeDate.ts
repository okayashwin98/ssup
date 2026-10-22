const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number) {
	const date = new Date(time);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

/** "Now", "5m ago", "3h ago", "Yesterday", "Tuesday", then "Oct 11" (with the year once it differs). */
export function formatRelativeDate(time: number, now = Date.now()): string {
	const elapsedMs = Math.max(0, now - time);
	if (elapsedMs < 60_000) return "Now";
	if (elapsedMs < 60 * 60_000) return `${Math.floor(elapsedMs / 60_000)}m ago`;
	const daysAgo = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
	if (daysAgo <= 0) return `${Math.floor(elapsedMs / (60 * 60_000))}h ago`;
	if (daysAgo === 1) return "Yesterday";
	if (daysAgo < 7) return new Date(time).toLocaleDateString(undefined, { weekday: "long" });
	const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
	return new Date(time).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

/** Video length as "0:57" or "1:02:05". */
export function formatDuration(durationMs: number | undefined): string | null {
	if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) return null;
	const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
}
