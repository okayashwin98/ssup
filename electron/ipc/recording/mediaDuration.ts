import type { Stats } from "node:fs";
import { probeMediaDurationSeconds } from "./diagnostics";

const durationCache = new Map<string, number>();

/** Media length in ms, probed once per file version so library listings stay fast. */
export async function getCachedMediaDurationMs(filePath: string, stat: Stats): Promise<number> {
	const key = `${filePath}:${stat.size}:${stat.mtimeMs}`;
	const cached = durationCache.get(key);
	if (cached !== undefined) return cached;
	const durationMs = Math.round(
		(await probeMediaDurationSeconds(filePath).catch(() => 0)) * 1000,
	);
	durationCache.set(key, durationMs);
	return durationMs;
}
