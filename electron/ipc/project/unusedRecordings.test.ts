import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trashOrphanRecordings } from "./migrateProjectFolders";
import { findUnusedRecordings, trashUnusedRecordings } from "./unusedRecordings";

let root: string;
let recordings: string;
const touch = async (file: string, contents = "xx") => {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, contents);
};
const exists = (file: string) =>
	fs.access(file).then(
		() => true,
		() => false,
	);
const old = async (...files: string[]) => {
	const when = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
	for (const file of files) await fs.utimes(file, when, when);
};
/** A recording with every companion file SuperShare writes. */
async function recording(dir: string, stamp: string, webcamStamp = stamp) {
	const video = path.join(dir, `recording-${stamp}.mp4`);
	const files = [
		video,
		`${video}.cursor.json`,
		path.join(dir, `recording-${stamp}.mic.wav`),
		path.join(dir, `recording-${stamp}.system.wav`),
		path.join(dir, `recording-${stamp}.mic.clean100-nofill.m4a`),
		path.join(dir, `recording-${webcamStamp}-webcam.mp4`),
		path.join(dir, `recording-${stamp}.recordly-session.json`),
	];
	for (const file of files) await touch(file);
	await touch(
		files[6],
		JSON.stringify({
			videoFileName: path.basename(video),
			webcamFileName: path.basename(files[5]),
		}),
	);
	await old(...files);
	return { video, files };
}
async function project(file: string, data: unknown) {
	await touch(file, JSON.stringify(data));
	return file;
}
const options = (projectFiles: string[], extra: Record<string, unknown> = {}) => ({
	recordingsDir: recordings,
	projectFiles,
	minAgeMs: 10 * 60 * 1000,
	...extra,
});
const offered = async (projectFiles: string[], extra: Record<string, unknown> = {}) =>
	(await findUnusedRecordings(options(projectFiles, extra)))
		.flatMap((group) => group.files.map((file) => path.relative(recordings, file.path)))
		.sort();

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-unused-"));
	recordings = path.join(root, "Recordings");
	await fs.mkdir(recordings);
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("findUnusedRecordings", () => {
	it("offers an unused recording with all its companion files as one item", async () => {
		const { files } = await recording(recordings, "1792000000001", "1792000000002");
		const groups = await findUnusedRecordings(options([]));
		expect(groups).toHaveLength(1);
		expect(groups[0].name).toBe("recording-1792000000001.mp4");
		expect(groups[0].files.map((file) => file.path).sort()).toEqual([...files].sort());
		let total = 0;
		for (const file of files) total += (await fs.stat(file)).size;
		expect(groups[0].bytes).toBe(total);
	});

	it("never offers a used recording or any of its cursor, audio, camera or cleaned-voice files", async () => {
		const folder = path.join(recordings, "Demo");
		const { video } = await recording(folder, "1792000000003", "1792000000004");
		const used = await project(path.join(folder, "Demo.ssup"), { videoPath: video });
		const loose = await recording(recordings, "1792000000005");
		const outside = await project(path.join(root, "Desktop", "Outside.ssup"), {
			videoPath: pathToFileURL(loose.video).href,
		});
		expect(await offered([used, outside])).toEqual([]);
	});

	it("keeps a recording that Locate recording copied into a project's folder", async () => {
		const folder = path.join(recordings, "Demo");
		const copy = path.join(folder, "recording-1792000000006 (2).mp4");
		const sidecars = [
			`${copy}.cursor.json`,
			path.join(folder, "recording-1792000000006 (2).mic.wav"),
			path.join(folder, "recording-1792000000006 (2)-webcam.mp4"),
		];
		for (const file of [copy, ...sidecars]) await touch(file);
		await old(copy, ...sidecars);
		const used = await project(path.join(folder, "Demo.ssup"), { videoPath: copy });
		expect(await offered([used])).toEqual([]);
	});

	it("offers an unused recording inside a project folder, naming the folder", async () => {
		const folder = path.join(recordings, "Demo");
		const { video } = await recording(folder, "1792000000007");
		const spare = path.join(folder, "recording-1792000000008.mp4");
		await touch(spare);
		await old(spare);
		const used = await project(path.join(folder, "Demo.ssup"), { videoPath: video });
		const groups = await findUnusedRecordings(options([used]));
		expect(groups.map((group) => [group.folder, group.name])).toEqual([
			["Demo", "recording-1792000000008.mp4"],
		]);
	});

	it("protects by name, the .bak copy, local media links and files in use right now", async () => {
		const moved = await recording(recordings, "1792000000009");
		const fromBak = await recording(recordings, "1792000000010");
		const viaLink = await recording(recordings, "1792000000011");
		const active = await recording(recordings, "1792000000012");
		// The project points at a drive that's gone; the same-named file here is kept.
		const used = await project(path.join(root, "A.ssup"), {
			videoPath: `/Volumes/Gone/${path.basename(moved.video)}`,
			editor: {
				webcam: {
					sourcePath: `http://127.0.0.1:5999/video?path=${encodeURIComponent(viaLink.video)}`,
				},
			},
		});
		await touch(`${used}.bak`, JSON.stringify({ videoPath: fromBak.video }));
		expect(await offered([used], { activePaths: [active.video] })).toEqual([]);
	});

	it("leaves recent files alone, and never offers files SuperShare did not name", async () => {
		await touch(path.join(recordings, "recording-1792000000013.mp4"));
		const personal = path.join(recordings, "Holiday.mp4");
		const stash = path.join(
			recordings,
			".recordly-trash-abc123",
			"recording-1792000000014.mp4",
		);
		const legacy = path.join(recordings, "Projects", "recording-1792000000015.mp4");
		for (const file of [personal, stash, legacy]) await touch(file);
		await old(personal, stash, legacy);
		expect(await offered([])).toEqual([]);
	});

	it("offers nothing when a saved project can't be read, and skips one that no longer exists", async () => {
		await recording(recordings, "1792000000016");
		const broken = await project(path.join(recordings, "Broken", "Broken.ssup"), {});
		await fs.writeFile(broken, "{ not json");
		await expect(findUnusedRecordings(options([broken]))).rejects.toThrow(
			'"Broken.ssup" could not be read',
		);
		expect(await offered([path.join(root, "Deleted.ssup")])).toHaveLength(7);
	});
});

describe("trashUnusedRecordings", () => {
	it("checks again before moving, and only ever calls Trash", async () => {
		const first = await recording(recordings, "1792000000017");
		const second = await recording(recordings, "1792000000018");
		const trashed: string[] = [];
		const latecomer = path.join(root, "Late.ssup");
		// A project starts using the second recording after the list was shown.
		await project(latecomer, { videoPath: second.video });
		const before = await fs.readFile(latecomer, "utf8");
		const result = await trashUnusedRecordings([first.video, second.video], {
			...options([latecomer]),
			trash: async (file) => {
				trashed.push(file);
				await fs.rm(file);
			},
		});
		expect(trashed.sort()).toEqual([...first.files].sort());
		expect(result.kept).toEqual([second.video]);
		expect(result.failed).toEqual([]);
		for (const file of second.files) expect(await exists(file)).toBe(true);
		// Projects are only read, never rewritten.
		expect(await fs.readFile(latecomer, "utf8")).toBe(before);
	});

	it("rejects a selection that isn't a list of paths", async () => {
		await expect(
			trashUnusedRecordings("everything", { ...options([]), trash: async () => undefined }),
		).rejects.toThrow("Invalid recording selection");
	});
});

describe("launch sweep", () => {
	it("keeps a used loose recording's companion files, which it used to trash", async () => {
		const used = await recording(recordings, "1792000000019");
		const unused = await recording(recordings, "1792000000020");
		const outside = await project(path.join(root, "Outside.ssup"), { videoPath: used.video });
		const trashed: string[] = [];
		await trashOrphanRecordings({
			recordingsDir: recordings,
			projectFiles: [outside],
			trash: async (file) => {
				trashed.push(file);
			},
			minAgeMs: 24 * 60 * 60 * 1000,
		});
		expect(trashed.sort()).toEqual([...unused.files].sort());
	});

	it("moves nothing when a project can't be read, and never looks inside project folders", async () => {
		await recording(recordings, "1792000000021");
		await recording(path.join(recordings, "Demo"), "1792000000022");
		const broken = path.join(root, "Broken.ssup");
		await touch(broken, "{");
		const trashed: string[] = [];
		const trash = async (file: string) => {
			trashed.push(file);
		};
		const sweep = { recordingsDir: recordings, trash, minAgeMs: 0 };
		expect(await trashOrphanRecordings({ ...sweep, projectFiles: [broken] })).toEqual([]);
		await trashOrphanRecordings({ ...sweep, projectFiles: [] });
		expect(trashed.every((file) => path.dirname(file) === recordings)).toBe(true);
		expect(trashed).toHaveLength(7);
	});
});
