import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateRecordingsIntoProjectFolders } from "./migrateProjectFolders";
import {
	assertProjectFolderRenameAllowed,
	getProjectMediaToTrash,
	moveProjectMediaIntoFolder,
	renameProjectMediaFolder,
} from "./projectMedia";

let root: string;
let recordings: string;
let projects: string;
const write = (file: string, contents: string) => fs.writeFile(file, contents);
const touch = (file: string, contents = "x") => fs.writeFile(file, contents);
const exists = (file: string) =>
	fs.access(file).then(
		() => true,
		() => false,
	);
const readJson = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));

async function makeRecording(stamp: string, webcamStamp?: string) {
	const video = path.join(recordings, `recording-${stamp}.mp4`);
	await touch(video);
	await touch(`${video}.cursor.json`);
	await touch(path.join(recordings, `recording-${stamp}.mic.wav`));
	if (webcamStamp) {
		const webcam = path.join(recordings, `recording-${webcamStamp}-webcam.mp4`);
		await touch(webcam);
		await touch(`${webcam}.cursor.json`);
		await touch(
			path.join(recordings, `recording-${stamp}.recordly-session.json`),
			JSON.stringify({
				videoFileName: path.basename(video),
				webcamFileName: path.basename(webcam),
			}),
		);
		return { video, webcam };
	}
	return { video, webcam: null };
}

async function makeProject(name: string, data: unknown) {
	const file = path.join(projects, `${name}.recordly`);
	await fs.writeFile(file, JSON.stringify(data));
	return file;
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-media-"));
	recordings = path.join(root, "recordings");
	projects = path.join(recordings, "Projects");
	await fs.mkdir(projects, { recursive: true });
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("project folders", () => {
	it("moves a recording with its camera, cursor, audio and session files into the project folder", async () => {
		const { video, webcam } = await makeRecording("1792743586796", "1792743585994");
		const imported = path.join(root, "Downloads-clip.mp4");
		await touch(imported);
		const project = await makeProject("Home REA", {
			videoPath: video,
			editor: {
				webcam: { sourcePath: pathToFileURL(webcam as string).href },
				music: imported,
			},
		});
		await fs.copyFile(project, `${project}.bak`);
		await touch(path.join(recordings, "recording-1792000000000.mp4"));

		const { moved } = await moveProjectMediaIntoFolder(project, recordings, write);

		const folder = path.join(recordings, "Home REA");
		const expected = [
			"recording-1792743585994-webcam.mp4",
			"recording-1792743585994-webcam.mp4.cursor.json",
			"recording-1792743586796.mic.wav",
			"recording-1792743586796.mp4",
			"recording-1792743586796.mp4.cursor.json",
			"recording-1792743586796.recordly-session.json",
		];
		expect(moved).toHaveLength(expected.length);
		expect((await fs.readdir(folder)).sort()).toEqual(expected.sort());
		for (const file of [project, `${project}.bak`]) {
			const data = await readJson(file);
			expect(data.videoPath).toBe(path.join(folder, "recording-1792743586796.mp4"));
			expect(data.editor.webcam.sourcePath).toBe(
				pathToFileURL(path.join(folder, "recording-1792743585994-webcam.mp4")).href,
			);
			expect(data.editor.music).toBe(imported);
		}
		expect(await exists(imported)).toBe(true);
		expect(await exists(path.join(recordings, "recording-1792000000000.mp4"))).toBe(true);
	});

	it("renames the folder with the project and keeps the paths pointing inside it", async () => {
		const { video } = await makeRecording("1792000000001");
		const project = await makeProject("Old name", { videoPath: video });
		await moveProjectMediaIntoFolder(project, recordings, write);
		const renamed = path.join(projects, "New name.recordly");
		await fs.rename(project, renamed);

		await renameProjectMediaFolder(recordings, project, renamed, write);

		expect(await exists(path.join(recordings, "Old name"))).toBe(false);
		expect((await readJson(renamed)).videoPath).toBe(
			path.join(recordings, "New name", "recording-1792000000001.mp4"),
		);
	});

	it("refuses names that clash with an app folder or an existing recordings folder", async () => {
		const source = path.join(projects, "A.recordly");
		await expect(
			assertProjectFolderRenameAllowed(
				recordings,
				source,
				path.join(projects, "projects.recordly"),
			),
		).rejects.toThrow(/reserved/);
		await fs.mkdir(path.join(recordings, "Taken"));
		await expect(
			assertProjectFolderRenameAllowed(
				recordings,
				source,
				path.join(projects, "Taken.recordly"),
			),
		).rejects.toThrow(/already exists/);
		await expect(
			assertProjectFolderRenameAllowed(
				recordings,
				source,
				path.join(projects, "Free.recordly"),
			),
		).resolves.toBeUndefined();
	});

	it("trashes a deleted project's folder unless another project still uses it", async () => {
		const { video } = await makeRecording("1792000000002");
		const project = await makeProject("Mine", { videoPath: video });
		await moveProjectMediaIntoFolder(project, recordings, write);
		const folder = path.join(recordings, "Mine");
		expect(await getProjectMediaToTrash(recordings, project, [])).toEqual([folder]);

		const other = await makeProject("Other", {
			videoPath: path.join(folder, "recording-1792000000002.mp4"),
		});
		expect(await getProjectMediaToTrash(recordings, project, [other])).toEqual([]);
	});
});

describe("one-time migration", () => {
	it("backs up, files every project's recordings and trashes old unused ones", async () => {
		const { video } = await makeRecording("1792000000003");
		await makeProject("Kept", { videoPath: video });
		const orphan = path.join(recordings, "recording-1792000000004.mp4");
		const fresh = path.join(recordings, "recording-1792000000005.mp4");
		await touch(orphan);
		await touch(fresh);
		const old = new Date(Date.now() - 60 * 60 * 1000);
		await fs.utimes(orphan, old, old);
		const trashed: string[] = [];
		const backupDir = path.join(root, "backup");

		const result = await migrateRecordingsIntoProjectFolders({
			recordingsDir: recordings,
			projectsDir: projects,
			backupDir,
			trash: async (file) => {
				trashed.push(file);
				await fs.rm(file);
			},
			write,
		});

		expect(result?.errors).toEqual([]);
		expect(trashed).toEqual([orphan]);
		expect(await exists(fresh)).toBe(true);
		expect(await exists(path.join(recordings, "Kept", "recording-1792000000003.mp4"))).toBe(
			true,
		);
		expect(await exists(path.join(backupDir, "recording-1792000000003.mp4"))).toBe(true);
		expect(await exists(path.join(backupDir, "Projects", "Kept.recordly"))).toBe(true);
		// Runs once per recordings folder.
		expect(
			await migrateRecordingsIntoProjectFolders({
				recordingsDir: recordings,
				projectsDir: projects,
				backupDir: path.join(root, "backup-2"),
				trash: async () => undefined,
				write,
			}),
		).toBeNull();
	});
});
