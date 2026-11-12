import { expect, test } from "vitest";
import { localStorageBreakdown } from "./StorageCard";

test("local storage splits the disk into the app, everything else and free space", () => {
	const result = localStorageBreakdown({ totalBytes: 1000, freeBytes: 200, appBytes: 100 });
	expect(result).toEqual({ otherBytes: 700, appPercent: 10, otherPercent: 70 });
	// A tiny app share still shows as a sliver.
	expect(localStorageBreakdown({ totalBytes: 1e12, freeBytes: 0, appBytes: 1 }).appPercent).toBe(
		1,
	);
});
