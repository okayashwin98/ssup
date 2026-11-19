import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expandMediaPaths, importMediaBatch } from "./importMediaBatch";

const dirs: string[] = [];
const tempDir = async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-batch-"));
	dirs.push(dir);
	return dir;
};
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("bulk media import", () => {
	it("finds videos in picked folders and subfolders, skipping other and hidden files", async () => {
		const source = await tempDir();
		await fs.mkdir(path.join(source, "Sub"));
		await fs.writeFile(path.join(source, "b.mp4"), "b");
		await fs.writeFile(path.join(source, "a.MOV"), "a");
		await fs.writeFile(path.join(source, "notes.txt"), "x");
		await fs.writeFile(path.join(source, ".hidden.mp4"), "h");
		await fs.writeFile(path.join(source, "empty.mp4"), "");
		await fs.writeFile(path.join(source, "Sub", "c.webm"), "c");
		const found = await expandMediaPaths([source]);
		expect(found.map((file) => path.relative(source, file))).toEqual([
			"a.MOV",
			"b.mp4",
			path.join("Sub", "c.webm"),
		]);
	});

	it("makes one project per video with its own copy, and skips repeats", async () => {
		const source = await tempDir();
		const recordings = await tempDir();
		const first = path.join(source, "Demo: v2.mp4");
		const second = path.join(source, "Walkthrough.mp4");
		await fs.writeFile(first, "one");
		await fs.writeFile(second, "two");
		const progress: number[] = [];
		const result = await importMediaBatch(recordings, [first, second], {
			onProgress: (p) => progress.push(p.done),
		});
		expect(result.failed).toEqual([]);
		expect(result.imported).toHaveLength(2);
		const project = JSON.parse(await fs.readFile(result.imported[0], "utf8"));
		expect(path.basename(result.imported[0])).toBe("Demo v2.ssup");
		expect(project.videoPath).toBe(path.join(path.dirname(result.imported[0]), "Demo: v2.mp4"));
		expect(await fs.readFile(project.videoPath, "utf8")).toBe("one");
		expect(progress).toEqual([0, 1, 2]);

		await fs.rm(first);
		const again = await importMediaBatch(recordings, [second]);
		expect(again.imported).toEqual([]);
		expect(again.skipped).toEqual([second]);
	});

	it("stops between videos when canceled and leaves no half project behind", async () => {
		const source = await tempDir();
		const recordings = await tempDir();
		const files = ["a.mp4", "b.mp4"].map((name) => path.join(source, name));
		for (const file of files) await fs.writeFile(file, "x");
		const controller = new AbortController();
		const result = await importMediaBatch(
			recordings,
			[...files, path.join(source, "gone.mp4")],
			{
				signal: controller.signal,
				onProgress: (p) => p.done === 1 && controller.abort(),
			},
		);
		expect(result.canceled).toBe(true);
		// The video in progress when Stop is pressed still finishes.
		expect(result.imported).toHaveLength(2);
		const missing = await importMediaBatch(recordings, [path.join(source, "gone.mp4")]);
		expect(missing.failed).toHaveLength(1);
		expect((await fs.readdir(recordings)).filter((n) => !n.startsWith("."))).toEqual([
			"a",
			"b",
		]);
	});

	it("dates each project, and keeps its video's date, from when the video was recorded", async () => {
		const source = await tempDir();
		const recordings = await tempDir();
		const video = path.join(source, "Old call.mp4");
		await fs.writeFile(video, "old");
		const recorded = new Date("2023-03-14T09:30:00Z");
		await fs.utimes(video, recorded, recorded);
		const { imported } = await importMediaBatch(recordings, [video]);
		const project = await fs.stat(imported[0]);
		expect(project.mtimeMs).toBe(recorded.getTime());
		const copy = JSON.parse(await fs.readFile(imported[0], "utf8")).videoPath;
		expect((await fs.stat(copy)).birthtimeMs).toBe(recorded.getTime());
	});
});
