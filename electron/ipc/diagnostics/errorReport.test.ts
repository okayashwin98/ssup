import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildErrorReportText, errorReportFileName, writeErrorReport } from "./errorReport";

const SECRET = "s3cr3t-share-password-123";
const ENDPOINT = "https://share.example.workers.dev/api/upload";
const now = new Date("2026-11-16T13:00:05.000Z");

function report(overrides: Partial<Parameters<typeof buildErrorReportText>[0]> = {}) {
	return buildErrorReportText({
		reason: "crash",
		windowType: "editor",
		screen: "home",
		error: {
			message: `Cannot read properties of undefined (uploading with ${SECRET})`,
			stack: "TypeError: boom\n    at Timeline (/Users/me/recordly/src/Timeline.tsx:10:5)",
			componentStack: "\n    at Timeline\n    at EditorShell",
		},
		logs: [
			"2026-11-16T12:59:00.000Z warn: Bearer abc.def.ghi failed",
			`2026-11-16T12:59:01.000Z error: POST ${ENDPOINT}?token=xyz987 failed`,
			"2026-11-16T12:59:02.000Z error: password=hunter22 api_key: KEY-123456",
			"2026-11-16T12:59:03.000Z error: GET https://share.example.workers.dev/v/abc failed",
		],
		exportSettings: { exportFormat: "mp4", exportQuality: "good" },
		editorProjectPath: "/Users/me/Recordings/Demo/Demo.ssup",
		app: { name: "SuperShare", version: "1.4.0", packaged: false, electron: "39.0.0" },
		system: { macOS: "26.1", kernel: "Darwin 25.1.0", chip: "Apple M3 Pro", arch: "arm64" },
		state: {
			projectPath: "/Users/me/Recordings/Demo/Demo.ssup",
			videoPath: "/Users/me/Recordings/Demo/recording-1.mp4",
			recordingsFolder: "/Users/me/Recordings",
			recording: { recordingNow: false, session: { videoPath: "/Users/me/x.mp4" } },
		},
		now,
		timeZone: "Asia/Kolkata",
		secrets: [SECRET, ENDPOINT, ""],
		...overrides,
	});
}

describe("error report text", () => {
	it("names the app, build, Mac, window and what failed", () => {
		const text = report();
		for (const expected of [
			"Version: 1.4.0",
			"Build: development",
			"macOS: 26.1",
			"Chip: Apple M3 Pro",
			"Architecture: arm64",
			"Window: editor",
			"Screen: home",
			"TypeError: boom",
			"at EditorShell",
			"exportFormat: mp4",
			"Recordings folder: /Users/me/Recordings",
			"Recording: /Users/me/Recordings/Demo/recording-1.mp4",
		])
			expect(text).toContain(expected);
	});

	it("labels local time and UTC", () => {
		const text = report();
		expect(text).toContain("Time (local, Asia/Kolkata, GMT+5:30): 2026-11-16 18:30:05");
		expect(text).toContain("Time (UTC): 2026-11-16T13:00:05.000Z");
	});

	it("keeps full file paths", () => {
		expect(report()).toContain("/Users/me/recordly/src/Timeline.tsx:10:5");
		expect(report()).toContain("Project file (window): /Users/me/Recordings/Demo/Demo.ssup");
	});

	it("removes the share password, share address, tokens and passwords", () => {
		const text = report();
		for (const secret of [
			SECRET,
			ENDPOINT,
			"share.example.workers.dev",
			"xyz987",
			"abc.def.ghi",
			"hunter22",
			"KEY-123456",
		])
			expect(text).not.toContain(secret);
		expect(text).toContain("[removed]");
	});

	it("leaves out the error sections for a menu report without an error", () => {
		const text = report({ reason: "menu", error: undefined });
		expect(text).toContain("SuperShare diagnostic report");
		expect(text).not.toContain("== Stack");
	});

	it("names files in the Mac's own time", () => {
		expect(errorReportFileName(now, "crash", "Asia/Kolkata")).toBe(
			"SuperShare error report 2026-11-16 18-30-05.txt",
		);
		expect(errorReportFileName(now, "menu", "UTC")).toBe(
			"SuperShare diagnostic report 2026-11-16 13-00-05.txt",
		);
	});
});

describe("writing the report", () => {
	const dirs: string[] = [];
	afterEach(async () => {
		for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
	});
	async function tempDir() {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-report-"));
		dirs.push(dir);
		return dir;
	}

	it("writes into Documents without asking, never over an existing report", async () => {
		const documents = await tempDir();
		const ask = async () => {
			throw new Error("should not ask");
		};
		const name = "SuperShare error report 2026-11-16 18-30-05.txt";
		const first = await writeErrorReport("one", name, documents, ask);
		const second = await writeErrorReport("two", name, documents, ask);
		const third = await writeErrorReport("three", name, documents, ask);
		expect(first).toEqual({
			success: true,
			path: path.join(documents, name),
			askedWhere: false,
		});
		expect(second.success && path.basename(second.path)).toBe(
			"SuperShare error report 2026-11-16 18-30-05 (2).txt",
		);
		expect(third.success && path.basename(third.path)).toBe(
			"SuperShare error report 2026-11-16 18-30-05 (3).txt",
		);
		expect(await fs.readFile(path.join(documents, name), "utf8")).toBe("one");
	});

	it("asks where to save when Documents can't be written", async () => {
		const elsewhere = await tempDir();
		const missing = path.join(elsewhere, "no-such-documents");
		const chosen = path.join(elsewhere, "picked.txt");
		const result = await writeErrorReport("text", "r.txt", missing, async (name) => {
			expect(name).toBe("r.txt");
			return chosen;
		});
		expect(result).toEqual({ success: true, path: chosen, askedWhere: true });
		expect(await fs.readFile(chosen, "utf8")).toBe("text");
	});

	it("writes nothing when the save dialog is cancelled", async () => {
		const elsewhere = await tempDir();
		const result = await writeErrorReport(
			"text",
			"r.txt",
			path.join(elsewhere, "x"),
			async () => null,
		);
		expect(result).toEqual({ success: false, canceled: true });
		expect(await fs.readdir(elsewhere)).toEqual([]);
	});
});
