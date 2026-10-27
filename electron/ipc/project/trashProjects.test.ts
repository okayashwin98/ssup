import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { trashLibraryProjects } from "./trashProjects";
it("rejects paths outside the project library before touching files", async () => {
	const trash = vi.fn();
	await expect(
		trashLibraryProjects(["/private/tmp/a.recordly", "/private/tmp/private.txt"], {
			list: async () => ({ entries: [{ path: "/private/tmp/a.recordly" }] }),
			trash,
			thumbnailPath: (p) => p + ".png",
		}),
	).rejects.toThrow("not in the library");
	expect(trash).not.toHaveBeenCalled();
});
it("trashes only selected project files, deduplicates paths, and reports partial failures", async () => {
	const trash = vi.fn(async (p: string) => {
		if (p.endsWith("b.recordly")) throw Error("locked");
	});
	const result = await trashLibraryProjects(
		["/private/tmp/a.recordly", "/private/tmp/a.recordly", "/private/tmp/b.recordly"],
		{
			list: async () => ({
				entries: [{ path: "/private/tmp/a.recordly" }, { path: "/private/tmp/b.recordly" }],
			}),
			trash,
			thumbnailPath: (p) => p + ".missing.png",
		},
	);
	expect(result.deleted).toEqual(["/private/tmp/a.recordly"]);
	expect(result.errors).toEqual(["Could not trash b.recordly"]);
	expect(trash.mock.calls.map(([p]) => p)).toEqual([
		"/private/tmp/a.recordly",
		"/private/tmp/b.recordly",
	]);
});
it("trashes a project's folder once, with its file, backups, preview and recordings", async () => {
	const recordings = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "recordly-trash-")),
	);
	try {
		const folder = path.join(recordings, "Demo");
		const project = path.join(folder, "Demo.ssup");
		const video = path.join(folder, "recording-1.mp4");
		await fs.mkdir(folder);
		await fs.writeFile(video, "video");
		await fs.writeFile(project, JSON.stringify({ videoPath: video }));
		for (const suffix of [".bak", ".bak.bak", ".preview.png"])
			await fs.writeFile(`${project}${suffix}`, "x");
		const trashed: string[] = [];
		const result = await trashLibraryProjects([project], {
			list: async () => ({ entries: [{ path: project }] }),
			trash: async (file) => {
				trashed.push(file);
				await fs.rm(file, { recursive: true });
			},
			thumbnailPath: (p) => `${p}.preview.png`,
			recordingsDir: recordings,
		});
		expect(result).toEqual({ deleted: [project], errors: [], trashedMedia: [folder] });
		expect(trashed).toEqual([folder]);
		expect(await fs.readdir(recordings)).toEqual([]);
	} finally {
		await fs.rm(recordings, { recursive: true, force: true });
	}
});
it("keeps a project's folder when another project still uses it, trashing only the project's files", async () => {
	const recordings = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "recordly-trash-")),
	);
	try {
		const folder = path.join(recordings, "Demo");
		const project = path.join(folder, "Demo.ssup");
		const video = path.join(folder, "recording-1.mp4");
		const copy = path.join(recordings, "Copy", "Copy.ssup");
		await fs.mkdir(folder);
		await fs.mkdir(path.dirname(copy));
		await fs.writeFile(video, "video");
		await fs.writeFile(project, JSON.stringify({ videoPath: video }));
		await fs.writeFile(`${project}.bak`, "x");
		await fs.writeFile(copy, JSON.stringify({ videoPath: video }));
		const trashed: string[] = [];
		const result = await trashLibraryProjects([project], {
			list: async () => ({ entries: [{ path: project }, { path: copy }] }),
			trash: async (file) => {
				trashed.push(file);
				await fs.rm(file, { recursive: true });
			},
			thumbnailPath: (p) => `${p}.preview.png`,
			recordingsDir: recordings,
		});
		expect(result).toEqual({ deleted: [project], errors: [], trashedMedia: [] });
		expect(trashed).toEqual([project, `${project}.bak`]);
		expect(await fs.readdir(folder)).toEqual(["recording-1.mp4"]);
	} finally {
		await fs.rm(recordings, { recursive: true, force: true });
	}
});
