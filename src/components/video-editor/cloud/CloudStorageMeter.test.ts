import { expect, it } from "vitest";
import { CLOUD_STORAGE_FREE_BYTES, cloudStoragePercent } from "./CloudStorageMeter";

it("shows storage use against the free allowance", () => {
	expect(cloudStoragePercent(0)).toBe(0);
	expect(cloudStoragePercent(9_791_000)).toBe(1);
	expect(cloudStoragePercent(CLOUD_STORAGE_FREE_BYTES / 2)).toBe(50);
	expect(cloudStoragePercent(CLOUD_STORAGE_FREE_BYTES * 2)).toBe(100);
});
