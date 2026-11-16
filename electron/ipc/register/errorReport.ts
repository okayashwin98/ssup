import os from "node:os";
import { app, BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import {
	buildErrorReportText,
	errorReportFileName,
	type RendererErrorReport,
	writeErrorReport,
} from "../diagnostics/errorReport";
import {
	countdownInProgress,
	currentProjectPath,
	currentRecordingSession,
	currentVideoPath,
	ffmpegScreenRecordingActive,
	lastNativeCaptureDiagnostics,
	nativeCapturePaused,
	nativeScreenRecordingActive,
	selectedSource,
} from "../state";
import { getRecordingsDir } from "../utils";

/** The share password and address, and the rest of .env, never go into a report. */
function reportSecrets() {
	return [
		import.meta.env.VITE_CLOUD_SHARE_SECRET,
		import.meta.env.VITE_CLOUD_SHARE_ENDPOINT,
		import.meta.env.VITE_PROFILE_NAME,
		process.env.VITE_CLOUD_SHARE_SECRET,
		process.env.VITE_CLOUD_SHARE_ENDPOINT,
		process.env.VITE_PROFILE_NAME,
	];
}

function windowTypeOf(sender: WebContents | null) {
	try {
		return new URL(sender?.getURL() ?? "").searchParams.get("windowType") || "unknown";
	} catch {
		return "unknown";
	}
}

function clip(text: unknown, max: number) {
	return typeof text === "string" ? text.slice(0, max) : undefined;
}

function sanitize(input: unknown, sender: WebContents | null): RendererErrorReport {
	const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const error = (raw.error && typeof raw.error === "object" ? raw.error : {}) as Record<
		string,
		unknown
	>;
	const reason = raw.reason === "project-load" || raw.reason === "menu" ? raw.reason : "crash";
	return {
		reason,
		// The window that asked is named by its own address, not by what it says.
		windowType: windowTypeOf(sender),
		screen: clip(raw.screen, 80),
		error: {
			message: clip(error.message, 20_000),
			stack: clip(error.stack, 50_000),
			componentStack: clip(error.componentStack, 50_000),
		},
		logs: Array.isArray(raw.logs)
			? raw.logs
					.filter((line): line is string => typeof line === "string")
					.slice(-100)
					.map((line) => line.slice(0, 4000))
			: [],
		exportSettings:
			raw.exportSettings && typeof raw.exportSettings === "object"
				? (raw.exportSettings as Record<string, unknown>)
				: null,
		editorProjectPath: clip(raw.editorProjectPath, 4000) ?? null,
	};
}

/** Builds the report text from what the window sent plus the app's own state. */
export async function buildReportForWindow(input: unknown, sender: WebContents | null) {
	const report = sanitize(input, sender);
	const now = new Date();
	const recordingsFolder = await getRecordingsDir().catch(() => null);
	const text = buildErrorReportText({
		...report,
		app: {
			name: "SuperShare",
			version: app.getVersion(),
			packaged: app.isPackaged,
			electron: process.versions.electron,
			chrome: process.versions.chrome,
		},
		system: {
			macOS: process.platform === "darwin" ? process.getSystemVersion() : undefined,
			kernel: `${os.type()} ${os.release()}`,
			chip: os.cpus()[0]?.model,
			arch: process.arch,
			rosetta: app.runningUnderARM64Translation,
		},
		state: {
			projectPath: currentProjectPath,
			videoPath: currentVideoPath,
			recordingsFolder,
			recording: {
				recordingNow: nativeScreenRecordingActive || ffmpegScreenRecordingActive,
				paused: nativeCapturePaused,
				countdownShowing: countdownInProgress,
				source: selectedSource ? `${selectedSource.name} (${selectedSource.id})` : null,
				session: currentRecordingSession,
				lastCaptureDiagnostics: lastNativeCaptureDiagnostics,
			},
		},
		now,
		secrets: reportSecrets(),
	});
	return { text, fileName: errorReportFileName(now, report.reason) };
}

export async function saveReport(input: unknown, sender: WebContents | null) {
	const { text, fileName } = await buildReportForWindow(input, sender);
	const owner = sender ? BrowserWindow.fromWebContents(sender) : null;
	return writeErrorReport(text, fileName, app.getPath("documents"), async (defaultName) => {
		const options = {
			title: "Save Error Report",
			defaultPath: defaultName,
			filters: [{ name: "Text", extensions: ["txt"] }],
		};
		const result = owner
			? await dialog.showSaveDialog(owner, options)
			: await dialog.showSaveDialog(options);
		return result.canceled || !result.filePath ? null : result.filePath;
	});
}

export function registerErrorReportHandlers() {
	ipcMain.handle("save-error-report", async (event, input: unknown) => {
		try {
			return await saveReport(input, event.sender);
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
