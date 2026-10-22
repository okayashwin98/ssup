import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUntitledProject } from "./createUntitledProject";
import { buildRecordingProjectName, getRecordingSourceLabel } from "./recordingProjectName";

const startedAt = new Date(2026, 9, 23, 14, 0, 0).getTime();
const date = new Date(startedAt).toLocaleDateString(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("recording project names", () => {
	it("uses the window title or Screen recording", () => {
		expect(
			getRecordingSourceLabel({
				name: "x",
				sourceType: "window",
				windowTitle: "Intelligence v2 – Figma",
			}),
		).toBe("Intelligence v2 – Figma");
		expect(getRecordingSourceLabel({ name: "Built-in Display", sourceType: "screen" })).toBe(
			"Screen recording",
		);
		expect(getRecordingSourceLabel({ name: "Area", sourceType: "area" })).toBe(
			"Screen recording",
		);
	});

	it("names a fresh recording after its source and date", () => {
		const videoPath = `/rec/recording-${startedAt + 2000}.mp4`;
		expect(buildRecordingProjectName(videoPath, { label: "Docs: Plan/v2", startedAt })).toBe(
			`Docs Plan v2 – ${date}`,
		);
		expect(buildRecordingProjectName(videoPath, null)).toBe(`Recording – ${date}`);
		expect(
			buildRecordingProjectName("/imports/clip.mp4", { label: "Figma", startedAt }),
		).toBeNull();
	});

	it("numbers a second project with the same name from 2", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-name-"));
		dirs.push(dir);
		const first = await createUntitledProject(dir, "{}", "Figma – Oct 23, 2026");
		const second = await createUntitledProject(dir, "{}", "Figma – Oct 23, 2026");
		expect([path.basename(first), path.basename(second)]).toEqual([
			"Figma – Oct 23, 2026.recordly",
			"Figma – Oct 23, 2026 2.recordly",
		]);
	});
});
