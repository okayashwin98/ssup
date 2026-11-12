import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { diskUsage, outermostPaths } from "./localStorage";

test("folders inside another counted folder are not counted twice", () => {
	expect(outermostPaths(["/a/data", "/a/data/recordings", "/b/recordings", "/a/data2"])).toEqual([
		"/a/data",
		"/b/recordings",
		"/a/data2",
	]);
});

test("disk usage adds up nested files and treats missing folders as empty", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
	try {
		await fs.mkdir(path.join(root, "nested"));
		await fs.writeFile(path.join(root, "nested", "a.bin"), Buffer.alloc(200_000));
		const size = await diskUsage(root);
		expect(size).toBeGreaterThanOrEqual(200_000);
		expect(await diskUsage(path.join(root, "missing"))).toBe(0);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
