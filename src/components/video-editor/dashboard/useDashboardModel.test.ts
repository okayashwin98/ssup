import { describe, expect, it } from "vitest";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import { compareEntries } from "./useDashboardModel";

const entry = (name: string, times: Partial<ProjectLibraryEntry>): ProjectLibraryEntry => ({
	path: `/${name}.recordly`,
	name,
	updatedAt: 0,
	thumbnailPath: null,
	isCurrent: false,
	isInProjectsDirectory: true,
	...times,
});
const order = (sort: string, entries: ProjectLibraryEntry[]) =>
	[...entries].sort(compareEntries(sort)).map((e) => e.name);

describe("dashboard sort", () => {
	// Saving rewrites the project file, so its file creation time equals its last edit.
	const older = entry("Older recording", { recordedAt: 100, createdAt: 900, updatedAt: 900 });
	const newer = entry("Newer recording", { recordedAt: 500, createdAt: 600, updatedAt: 600 });

	it("orders Last created by recording time, not by when the project file was saved", () => {
		expect(order("created", [older, newer])).toEqual(["Newer recording", "Older recording"]);
		expect(order("recent", [older, newer])).toEqual(["Older recording", "Newer recording"]);
	});

	it("falls back to the file creation time, then the edit time", () => {
		const noRecording = entry("No recording", { createdAt: 700, updatedAt: 50 });
		const bare = entry("Bare", { updatedAt: 300 });
		expect(order("created", [bare, older, noRecording, newer])).toEqual([
			"No recording",
			"Newer recording",
			"Bare",
			"Older recording",
		]);
	});
});
