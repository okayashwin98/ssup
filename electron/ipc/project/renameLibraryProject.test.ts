import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { reconcileProjectFolder } from "./projectMedia";
import { renameLibraryProject } from "./renameLibraryProject";

it("renames a library project with its preview without overwriting another project", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-rename-"));
	const original = path.join(dir, "Original.recordly"),
		target = path.join(dir, "Renamed.recordly");
	const sidecars = (file: string) => [`${file}.png`];
	try {
		await fs.writeFile(original, "project");
		await fs.writeFile(`${original}.png`, "preview");
		await fs.writeFile(target, "keep");
		await expect(
			renameLibraryProject(original, "Renamed", [original], sidecars),
		).rejects.toThrow();
		expect(await fs.readFile(target, "utf8")).toBe("keep");
		await fs.rm(target);
		await expect(
			renameLibraryProject(original, "../escape", [original], sidecars),
		).rejects.toThrow();
		await expect(renameLibraryProject(original, "Renamed", [], sidecars)).rejects.toThrow();
		expect(await renameLibraryProject(original, "Renamed", [original], sidecars)).toBe(target);
		expect(await fs.readFile(target, "utf8")).toBe("project");
		expect(await fs.readFile(`${target}.png`, "utf8")).toBe("preview");
		await expect(fs.access(original)).rejects.toThrow();
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

it("moves a project in its own folder to a folder of the new name, and its recordings follow when filed", async () => {
	const recordings = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "recordly-rename-")),
	);
	const write = (file: string, contents: string) => fs.writeFile(file, contents);
	const sidecars = (file: string) => [`${file}.preview.png`, `${file}.bak`];
	try {
		const oldFolder = path.join(recordings, "Old");
		const original = path.join(oldFolder, "Old.ssup");
		const video = path.join(oldFolder, "recording-1.mp4");
		await fs.mkdir(oldFolder);
		await fs.writeFile(video, "video");
		const data = JSON.stringify({
			videoPath: video,
			editor: { webcam: { sourcePath: pathToFileURL(video).href } },
		});
		await fs.writeFile(original, data);
		await fs.writeFile(`${original}.bak`, data);
		await fs.writeFile(`${original}.preview.png`, "preview");
		// A taken name changes nothing.
		await fs.mkdir(path.join(recordings, "Taken"));
		await expect(
			renameLibraryProject(original, "Taken", [original], sidecars, recordings),
		).rejects.toThrow();
		expect((await fs.readdir(oldFolder)).sort()).toEqual([
			"Old.ssup",
			"Old.ssup.bak",
			"Old.ssup.preview.png",
			"recording-1.mp4",
		]);

		const target = await renameLibraryProject(
			original,
			"New",
			[original],
			sidecars,
			recordings,
		);
		const newFolder = path.join(recordings, "New");
		expect(target).toBe(path.join(newFolder, "New.ssup"));
		expect((await fs.readdir(newFolder)).sort()).toEqual([
			"New.ssup",
			"New.ssup.bak",
			"New.ssup.preview.png",
		]);
		// Recordings stay put until the project is filed (it may be open in the editor).
		expect(await fs.readdir(oldFolder)).toEqual(["recording-1.mp4"]);

		await reconcileProjectFolder(target, recordings, write, []);

		await expect(fs.access(oldFolder)).rejects.toThrow();
		const moved = path.join(newFolder, "recording-1.mp4");
		expect(await fs.readFile(moved, "utf8")).toBe("video");
		for (const file of [target, `${target}.bak`]) {
			const saved = JSON.parse(await fs.readFile(file, "utf8"));
			expect(saved.videoPath).toBe(moved);
			expect(saved.editor.webcam.sourcePath).toBe(pathToFileURL(moved).href);
		}
	} finally {
		await fs.rm(recordings, { recursive: true, force: true });
	}
});

it("removes a project's old folder when it held no recordings", async () => {
	const recordings = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "recordly-rename-")),
	);
	try {
		const original = path.join(recordings, "Empty", "Empty.ssup");
		await fs.mkdir(path.dirname(original));
		await fs.writeFile(original, "{}");
		await fs.writeFile(path.join(recordings, "Empty", ".DS_Store"), "");
		const target = await renameLibraryProject(
			original,
			"Full",
			[original],
			() => [],
			recordings,
		);
		expect(target).toBe(path.join(recordings, "Full", "Full.ssup"));
		expect((await fs.readdir(recordings)).sort()).toEqual(["Full"]);
	} finally {
		await fs.rm(recordings, { recursive: true, force: true });
	}
});
