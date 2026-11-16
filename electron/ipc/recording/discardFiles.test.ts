import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { discardRecordingFiles } from "./discardFiles";

const TAKE_A = [
	"recording-1000.mp4",
	"recording-1000.mp4.cursor.json",
	"recording-1000.mic.m4a",
	"recording-1000.system.m4a",
	"recording-1000.mic.wav",
	"recording-1000.mic.wav.json",
	"recording-1000.mic.clean100-nofill.m4a",
	"recording-1000.mic.nofill.m4a",
	"recording-1000.recordly-session.json",
	"recording-1000-webcam.webm",
];
// Take B's name starts with take A's: it must still be left alone.
const TAKE_B = [
	"recording-10005.mp4",
	"recording-10005.mp4.cursor.json",
	"recording-10005.mic.m4a",
	"recording-10005.system.m4a",
	"recording-10005-webcam.webm",
];
const UNRELATED = "notes.txt";
const PROJECT_FILES = ["recording-1000.mp4", "recording-1000.mic.m4a", "Demo.ssup"];

let root = "";
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "recordly-discard-")));
	for (const name of [...TAKE_A, ...TAKE_B, UNRELATED]) {
		await fs.writeFile(path.join(root, name), name);
	}
	await fs.mkdir(path.join(root, "Demo"));
	for (const name of PROJECT_FILES) await fs.writeFile(path.join(root, "Demo", name), name);
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

it("deletes every file of the discarded take and nothing else", async () => {
	const removed = await discardRecordingFiles(path.join(root, "recording-1000.mp4"));

	expect(removed.map((file) => path.basename(file)).sort()).toEqual([...TAKE_A].sort());
	expect((await fs.readdir(root)).sort()).toEqual([...TAKE_B, UNRELATED, "Demo"].sort());
	expect((await fs.readdir(path.join(root, "Demo"))).sort()).toEqual([...PROJECT_FILES].sort());
});

it("can be retried after the video itself is already gone", async () => {
	await fs.rm(path.join(root, "recording-1000.mp4"));

	await discardRecordingFiles(path.join(root, "recording-1000.mp4"));

	expect((await fs.readdir(root)).sort()).toEqual([...TAKE_B, UNRELATED, "Demo"].sort());
});
