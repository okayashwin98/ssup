import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProjectFileAtomically } from "./atomicSave";
import {
	RELINK_ERRORS,
	type RelinkDeps,
	relinkProjectRecording,
	requiredRecordingDurationMs,
} from "./relinkRecording";

let root: string;
let recordings: string;
let projectFolder: string;
let projectPath: string;
let elsewhere: string;

const missing = () => path.join(projectFolder, "recording-1.mp4");

function projectData(extra: Record<string, unknown> = {}) {
	return {
		version: 2,
		videoPath: missing(),
		editor: {
			clipRegions: [{ id: "a", startMs: 0, endMs: 9000, speed: 1 }],
			webcam: { sourcePath: path.join(projectFolder, "recording-1-webcam.mp4") },
			audioTracks: [{ sourcePath: path.join(projectFolder, "recording-1.mic.m4a") }],
			annotationRegions: [{ startMs: 0, endMs: 60000 }],
		},
		...extra,
	};
}

function deps(overrides: Partial<RelinkDeps> = {}): RelinkDeps {
	return {
		recordingsDir: recordings,
		chooseRecording: async () => path.join(elsewhere, "take.mov"),
		probeDurationSeconds: async () => 10,
		writeProject: writeProjectFileAtomically,
		freeBytes: async () => 10 * 1024 ** 3,
		...overrides,
	};
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "ss-relink-"));
	recordings = path.join(root, "Recordings");
	projectFolder = path.join(recordings, "Demo");
	projectPath = path.join(projectFolder, "Demo.ssup");
	elsewhere = path.join(root, "Desktop");
	await fs.mkdir(projectFolder, { recursive: true });
	await fs.mkdir(elsewhere, { recursive: true });
	await fs.writeFile(projectPath, JSON.stringify(projectData(), null, 2));
	for (const name of [
		"take.mov",
		"take.mov.cursor.json",
		"take.mic.m4a",
		"take.system.m4a",
		"take.mic.clean100.m4a",
		"take-webcam.mp4",
		"other.mov",
		"other.mic.m4a",
	])
		await fs.writeFile(path.join(elsewhere, name), name);
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

async function readProject() {
	return JSON.parse(await fs.readFile(projectPath, "utf8"));
}

describe("locating a project's recording", () => {
	it("copies the recording and its own sidecars into the project's folder and repoints the project", async () => {
		const before = await fs.readFile(projectPath, "utf8");
		const result = await relinkProjectRecording(projectPath, deps());
		expect(result).toMatchObject({
			success: true,
			videoPath: path.join(projectFolder, "take.mov"),
		});
		expect((await fs.readdir(projectFolder)).sort()).toEqual(
			[
				"Demo.ssup",
				"Demo.ssup.bak",
				"take-webcam.mp4",
				"take.mic.clean100.m4a",
				"take.mic.m4a",
				"take.mov",
				"take.mov.cursor.json",
				"take.system.m4a",
			].sort(),
		);
		// Another recording's files are never taken along, and the originals stay put.
		expect(await fs.readdir(elsewhere)).toHaveLength(8);
		const project = await readProject();
		expect(project.videoPath).toBe(path.join(projectFolder, "take.mov"));
		expect(project.editor.webcam.sourcePath).toBe(path.join(projectFolder, "take-webcam.mp4"));
		expect(project.editor.audioTracks[0].sourcePath).toBe(
			path.join(projectFolder, "take.mic.m4a"),
		);
		expect(project.editor.clipRegions).toEqual(projectData().editor.clipRegions);
		// The previous project file is kept beside it.
		expect(await fs.readFile(`${projectPath}.bak`, "utf8")).toBe(before);
		expect((await fs.readdir(projectFolder)).some((name) => name.endsWith(".tmp"))).toBe(false);
	});

	it("never overwrites: a clashing name gets a number, sidecars and session file alike", async () => {
		await fs.writeFile(path.join(projectFolder, "take.mov"), "someone else's take");
		await fs.writeFile(
			path.join(elsewhere, "take.recordly-session.json"),
			JSON.stringify({
				version: 2,
				videoFileName: "take.mov",
				webcamFileName: "take-webcam.mp4",
			}),
		);
		const result = await relinkProjectRecording(projectPath, deps());
		expect(result).toMatchObject({ videoPath: path.join(projectFolder, "take (2).mov") });
		expect(await fs.readFile(path.join(projectFolder, "take.mov"), "utf8")).toBe(
			"someone else's take",
		);
		for (const name of ["take (2).mov.cursor.json", "take (2).mic.m4a", "take (2)-webcam.mp4"])
			expect(await fs.readFile(path.join(projectFolder, name), "utf8")).toBeTruthy();
		const session = JSON.parse(
			await fs.readFile(path.join(projectFolder, "take (2).recordly-session.json"), "utf8"),
		);
		expect(session).toMatchObject({
			videoFileName: "take (2).mov",
			webcamFileName: "take (2)-webcam.mp4",
		});
	});

	it("rejects a recording too short for the saved edits, changing nothing", async () => {
		const before = await fs.readFile(projectPath, "utf8");
		await expect(
			relinkProjectRecording(projectPath, deps({ probeDurationSeconds: async () => 5 })),
		).rejects.toThrow(RELINK_ERRORS.tooShort);
		expect(await fs.readFile(projectPath, "utf8")).toBe(before);
		expect(await fs.readdir(projectFolder)).toEqual(["Demo.ssup"]);
	});

	it("rejects files that aren't readable videos", async () => {
		await expect(
			relinkProjectRecording(projectPath, deps({ probeDurationSeconds: async () => 0 })),
		).rejects.toThrow(RELINK_ERRORS.invalid);
		await fs.writeFile(path.join(elsewhere, "notes.txt"), "x");
		await expect(
			relinkProjectRecording(
				projectPath,
				deps({ chooseRecording: async () => path.join(elsewhere, "notes.txt") }),
			),
		).rejects.toThrow(RELINK_ERRORS.invalid);
	});

	it("does nothing when the picker is cancelled", async () => {
		const before = await fs.readFile(projectPath, "utf8");
		const result = await relinkProjectRecording(
			projectPath,
			deps({ chooseRecording: async () => null }),
		);
		expect(result).toEqual({ success: false, canceled: true });
		expect(await fs.readFile(projectPath, "utf8")).toBe(before);
		expect(await fs.readdir(projectFolder)).toEqual(["Demo.ssup"]);
	});

	it("uses a recording already in the project's folder without copying it", async () => {
		await fs.writeFile(path.join(projectFolder, "renamed.mp4"), "video");
		const result = await relinkProjectRecording(
			projectPath,
			deps({ chooseRecording: async () => path.join(projectFolder, "renamed.mp4") }),
		);
		expect(result).toEqual({
			success: true,
			videoPath: path.join(projectFolder, "renamed.mp4"),
			copied: [],
		});
		expect((await readProject()).videoPath).toBe(path.join(projectFolder, "renamed.mp4"));
		expect((await fs.readdir(projectFolder)).sort()).toEqual(
			["Demo.ssup", "Demo.ssup.bak", "renamed.mp4"].sort(),
		);
	});

	it("stops before copying when the disk is too full", async () => {
		const before = await fs.readFile(projectPath, "utf8");
		await expect(
			relinkProjectRecording(projectPath, deps({ freeBytes: async () => 1024 })),
		).rejects.toThrow(RELINK_ERRORS.noSpace);
		expect(await fs.readFile(projectPath, "utf8")).toBe(before);
		expect(await fs.readdir(projectFolder)).toEqual(["Demo.ssup"]);
	});

	it("removes its copies when the project changes while you choose", async () => {
		const result = relinkProjectRecording(
			projectPath,
			deps({
				chooseRecording: async () => {
					await fs.writeFile(projectPath, JSON.stringify(projectData({ version: 3 })));
					return path.join(elsewhere, "take.mov");
				},
			}),
		);
		await expect(result).rejects.toThrow(RELINK_ERRORS.changed);
		expect((await readProject()).version).toBe(3);
		expect(await fs.readdir(projectFolder)).toEqual(["Demo.ssup"]);
	});

	it("leaves nothing half-copied when a copy fails", async () => {
		const unreadable = path.join(elsewhere, "take.system.m4a");
		await fs.chmod(unreadable, 0o000);
		try {
			await expect(relinkProjectRecording(projectPath, deps())).rejects.toThrow();
		} finally {
			await fs.chmod(unreadable, 0o644);
		}
		expect(await fs.readdir(projectFolder)).toEqual(["Demo.ssup"]);
	});

	it("refuses when the recording is available again", async () => {
		await fs.writeFile(missing(), "back");
		await expect(relinkProjectRecording(projectPath, deps())).rejects.toThrow(
			RELINK_ERRORS.available,
		);
	});

	it("counts sped-up clips and undo history in the length needed", () => {
		expect(
			requiredRecordingDurationMs({
				editor: {
					clipRegions: [{ startMs: 0, endMs: 1000, speed: 2, sourceStartMs: 500 }],
				},
				history: {
					version: 1,
					values: [{ startMs: 0, endMs: 4000, speed: 1 }],
					past: [{ clipRegions: [0] }],
				},
			}),
		).toBe(4000);
	});
});
