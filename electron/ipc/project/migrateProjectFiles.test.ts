import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateProjectFilesIntoFolders } from "./migrateProjectFiles";

let root: string;
let recordings: string;
let projects: string;
let options: Parameters<typeof migrateProjectFilesIntoFolders>[0];
const write = (file: string, contents: string) => fs.writeFile(file, contents);
const exists = (file: string) =>
	fs.access(file).then(
		() => true,
		() => false,
	);
const readJson = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));

async function makeLegacyProject(name: string, data: unknown) {
	const file = path.join(projects, `${name}.recordly`);
	await fs.writeFile(file, JSON.stringify(data));
	return file;
}

beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "supershare-ssup-")));
	recordings = path.join(root, "recordings");
	projects = path.join(recordings, "Projects");
	await fs.mkdir(projects, { recursive: true });
	await fs.mkdir(path.join(root, "userData"));
	options = {
		recordingsDir: recordings,
		backupDir: path.join(root, "userData", "backups", "projects-before-ssup"),
		recentProjectsFile: path.join(root, "userData", "recent-projects.json"),
		movesFile: path.join(root, "userData", "project-path-moves.json"),
		write,
	};
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("moving project files into their folders", () => {
	it("backs up, files recordings, moves each project with its backups and preview as .ssup, and rewrites the recent list", async () => {
		const video = path.join(recordings, "recording-1792000000001.mp4");
		await fs.writeFile(video, "video");
		await fs.writeFile(`${video}.cursor.json`, "[]");
		const demo = await makeLegacyProject("Demo", { videoPath: video, editor: {} });
		for (const suffix of [".bak", ".bak.bak", ".preview.png"])
			await fs.writeFile(`${demo}${suffix}`, suffix === ".preview.png" ? "png" : "{}");
		// Renamed while open: its recordings still sit in a folder with its old name.
		const stale = path.join(recordings, "Old name", "recording-1792000000002.mp4");
		await fs.mkdir(path.dirname(stale));
		await fs.writeFile(stale, "video");
		const renamed = await makeLegacyProject("Renamed", { videoPath: stale, editor: {} });
		const elsewhere = path.join(root, "Desktop", "Elsewhere.recordly");
		await fs.mkdir(path.dirname(elsewhere));
		await fs.writeFile(elsewhere, JSON.stringify({ videoPath: video }));
		const recent = { paths: [renamed, elsewhere, demo] };
		await fs.writeFile(options.recentProjectsFile, JSON.stringify(recent));

		const result = await migrateProjectFilesIntoFolders(options);

		const demoTarget = path.join(recordings, "Demo", "Demo.ssup");
		const renamedTarget = path.join(recordings, "Renamed", "Renamed.ssup");
		expect(result?.errors).toEqual([]);
		expect(result?.skipped).toEqual([]);
		expect(result?.moved).toEqual({ [demo]: demoTarget, [renamed]: renamedTarget });
		expect((await fs.readdir(path.join(recordings, "Demo"))).sort()).toEqual([
			"Demo.ssup",
			"Demo.ssup.bak",
			"Demo.ssup.bak.bak",
			"Demo.ssup.preview.png",
			"recording-1792000000001.mp4",
			"recording-1792000000001.mp4.cursor.json",
		]);
		expect(await fs.readFile(`${demoTarget}.preview.png`, "utf8")).toBe("png");
		expect((await readJson(demoTarget)).videoPath).toBe(
			path.join(recordings, "Demo", "recording-1792000000001.mp4"),
		);
		expect(await exists(path.join(recordings, "Old name"))).toBe(false);
		expect((await readJson(renamedTarget)).videoPath).toBe(
			path.join(recordings, "Renamed", "recording-1792000000002.mp4"),
		);
		// The shared Projects folder is gone; the project saved elsewhere is untouched.
		expect(await exists(projects)).toBe(false);
		expect(await readJson(elsewhere)).toEqual({ videoPath: video });
		expect(await readJson(options.recentProjectsFile)).toEqual({
			paths: [renamedTarget, elsewhere, demoTarget],
		});
		expect(await readJson(options.movesFile)).toEqual({
			moves: { [demo]: demoTarget, [renamed]: renamedTarget },
		});
		// The backup holds everything as it was before the move.
		expect(result?.backupDir).toBe(options.backupDir);
		expect(await readJson(path.join(options.backupDir, "Projects", "Demo.recordly"))).toEqual({
			videoPath: video,
			editor: {},
		});
		expect(
			await exists(path.join(options.backupDir, "Projects", "Demo.recordly.preview.png")),
		).toBe(true);
		expect(await readJson(path.join(options.backupDir, "recent-projects.json"))).toEqual(
			recent,
		);
	});

	it("runs once per recordings folder", async () => {
		await makeLegacyProject("First", { videoPath: "/missing.mp4", editor: {} });
		expect(await migrateProjectFilesIntoFolders(options)).not.toBeNull();
		await fs.mkdir(projects);
		const later = await makeLegacyProject("Later", { videoPath: "/missing.mp4", editor: {} });
		expect(await migrateProjectFilesIntoFolders(options)).toBeNull();
		expect(await exists(later)).toBe(true);
		expect(await exists(path.join(recordings, "First", "First.ssup"))).toBe(true);
	});

	it("leaves a project in place, and never overwrites, when its new name is taken", async () => {
		const taken = path.join(recordings, "Clash", "Clash.ssup");
		await fs.mkdir(path.dirname(taken));
		await fs.writeFile(taken, "keep");
		const clash = await makeLegacyProject("Clash", { videoPath: "/missing.mp4", editor: {} });
		const free = await makeLegacyProject("Free", { videoPath: "/missing.mp4", editor: {} });

		const result = await migrateProjectFilesIntoFolders(options);

		expect(result?.errors).toEqual([]);
		expect(result?.skipped).toEqual(["Clash.recordly: Clash.ssup already exists"]);
		expect(result?.moved).toEqual({ [free]: path.join(recordings, "Free", "Free.ssup") });
		expect(await fs.readFile(taken, "utf8")).toBe("keep");
		expect(await exists(clash)).toBe(true);
		// The skip is final: the next launch does not try again.
		expect(await migrateProjectFilesIntoFolders(options)).toBeNull();
	});

	it("does nothing to a recordings folder without old projects", async () => {
		const result = await migrateProjectFilesIntoFolders(options);
		expect(result).toMatchObject({ projects: 0, moved: {}, backupDir: null });
		expect(await exists(options.backupDir)).toBe(false);
		expect(await exists(options.movesFile)).toBe(false);
	});
});
