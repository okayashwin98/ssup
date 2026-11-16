import fs from "node:fs/promises";
import path from "node:path";
import { scrubSecrets } from "../../../src/lib/feedback/scrubSecrets";

/** What a window sends when it saves a report; the main process adds the rest. */
export type RendererErrorReport = {
	reason: "crash" | "project-load" | "menu";
	windowType: string;
	screen?: string;
	error?: { message?: string; stack?: string; componentStack?: string };
	logs?: string[];
	exportSettings?: Record<string, unknown> | null;
	editorProjectPath?: string | null;
};

export type ErrorReportInput = RendererErrorReport & {
	app: { name: string; version: string; packaged: boolean; electron?: string; chrome?: string };
	system: { macOS?: string; kernel?: string; chip?: string; arch?: string; rosetta?: boolean };
	state: {
		projectPath?: string | null;
		videoPath?: string | null;
		recordingsFolder?: string | null;
		recording?: Record<string, unknown> | null;
	};
	now: Date;
	timeZone?: string;
	/** Exact values to remove wherever they appear (share password, endpoint, .env values). */
	secrets?: Array<string | null | undefined>;
};

const REASONS: Record<ErrorReportInput["reason"], string> = {
	crash: "Part of the app stopped working",
	"project-load": "A project couldn't be opened",
	menu: "Saved from Help → Save diagnostic report",
};

function localTime(now: Date, timeZone?: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
			timeZoneName: "shortOffset",
		})
			.formatToParts(now)
			.map((part) => [part.type, part.value]),
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}:${parts.second}`,
		offset: parts.timeZoneName as string,
		zone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
}

/** "SuperShare error report 2026-11-16 18-30-05.txt", in the Mac's own time. */
export function errorReportFileName(
	now: Date,
	reason: ErrorReportInput["reason"],
	timeZone?: string,
) {
	const { date, time } = localTime(now, timeZone);
	const kind = reason === "menu" ? "diagnostic report" : "error report";
	return `SuperShare ${kind} ${date} ${time.replace(/:/g, "-")}.txt`;
}

function value(item: unknown): string {
	if (item === null || item === undefined || item === "") return "none";
	if (typeof item === "string") return item;
	return JSON.stringify(item);
}

function section(title: string, lines: string[]) {
	return [`== ${title}`, ...(lines.length ? lines : ["none"]), ""];
}

function keyValues(record: Record<string, unknown> | null | undefined) {
	if (!record) return [];
	return Object.entries(record).map(([key, item]) => `${key}: ${value(item)}`);
}

/** A readable report: app, Mac, time, what failed, and the app state that helps find why. */
export function buildErrorReportText(input: ErrorReportInput): string {
	const local = localTime(input.now, input.timeZone);
	const error = input.error ?? {};
	const lines = [
		`SuperShare ${input.reason === "menu" ? "diagnostic" : "error"} report`,
		"",
		...section("Summary", [
			`What happened: ${REASONS[input.reason]}`,
			`Window: ${input.windowType || "unknown"}`,
			`Screen: ${input.screen || "unknown"}`,
			`Time (local, ${local.zone}, ${local.offset}): ${local.date} ${local.time}`,
			`Time (UTC): ${input.now.toISOString()}`,
		]),
		...section("App", [
			`Name: ${input.app.name}`,
			`Version: ${input.app.version}`,
			`Build: ${input.app.packaged ? "packaged app" : "development"}`,
			`Electron: ${value(input.app.electron)}`,
			`Chrome: ${value(input.app.chrome)}`,
		]),
		...section("Mac", [
			`macOS: ${value(input.system.macOS)}`,
			`Kernel: ${value(input.system.kernel)}`,
			`Chip: ${value(input.system.chip)}`,
			`Architecture: ${value(input.system.arch)}${input.system.rosetta ? " (running under Rosetta)" : ""}`,
		]),
	];
	if (input.reason !== "menu" || error.message) {
		lines.push(
			...section("Error", [error.message?.trim() || "No message"]),
			...section("Stack", error.stack?.trim() ? [error.stack.trim()] : []),
			...section(
				"Component stack",
				error.componentStack?.trim() ? [error.componentStack.trim()] : [],
			),
		);
	}
	lines.push(
		...section("Project", [
			`Project file (app): ${value(input.state.projectPath)}`,
			`Project file (window): ${value(input.editorProjectPath)}`,
			`Recording: ${value(input.state.videoPath)}`,
			`Recordings folder: ${value(input.state.recordingsFolder)}`,
		]),
		...section("Recording", keyValues(input.state.recording)),
		...section(
			"Export settings",
			input.exportSettings
				? keyValues(input.exportSettings)
				: ["not available in this window"],
		),
		...section(
			`Recent warnings and errors (${input.logs?.length ?? 0}, oldest first)`,
			input.logs?.slice(-100) ?? [],
		),
		"Export history: SuperShare does not keep one.",
		"",
	);
	return scrubSecrets(lines.join("\n"), input.secrets);
}

type FallbackPicker = (defaultName: string) => Promise<string | null>;

const UNWRITABLE = new Set(["EACCES", "EPERM", "EROFS", "ENOENT", "ENOTDIR"]);

/** Writes into Documents without asking, never over an existing file; asks where only if Documents can't take it. */
export async function writeErrorReport(
	text: string,
	fileName: string,
	documentsDir: string,
	chooseFallback: FallbackPicker,
): Promise<
	{ success: true; path: string; askedWhere: boolean } | { success: false; canceled: true }
> {
	const extension = path.extname(fileName);
	const stem = fileName.slice(0, -extension.length);
	try {
		for (let attempt = 1; attempt < 1000; attempt++) {
			const candidate = path.join(
				documentsDir,
				attempt === 1 ? fileName : `${stem} (${attempt})${extension}`,
			);
			try {
				await fs.writeFile(candidate, text, { encoding: "utf8", flag: "wx" });
				return { success: true, path: candidate, askedWhere: false };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		}
		throw Object.assign(new Error("Too many reports with this name"), { code: "EACCES" });
	} catch (error) {
		if (!UNWRITABLE.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
	}
	const chosen = await chooseFallback(fileName);
	if (!chosen) return { success: false, canceled: true };
	await fs.writeFile(chosen, text, "utf8");
	return { success: true, path: chosen, askedWhere: true };
}
