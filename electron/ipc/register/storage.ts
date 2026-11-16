import os from "node:os";
import path from "node:path";
import { app, ipcMain, shell } from "electron";
import { isHudRecordingInProgress } from "../../windows";
import { loadRecentProjectPaths, rememberApprovedLocalReadPath } from "../project/manager";
import { listLibraryProjectFiles } from "../project/projectMedia";
import {
	findUnusedRecordings,
	trashUnusedRecordings,
	type UnusedRecordingOptions,
} from "../project/unusedRecordings";
import * as state from "../state";
import { measureLocalStorage } from "../storage/localStorage";
import { getRecordingsDir } from "../utils";

const CACHE_MS = 60_000;
let cached: { at: number; bytes: Promise<number> } | null = null;
// A recording this fresh may still be waiting for its project to be saved (as the launch sweep).
const UNUSED_MIN_AGE_MS = 10 * 60 * 1000;

/** Every folder the app keeps your data in: recordings, projects, models, caches, logs. */
async function dataPaths(): Promise<string[]> {
	const paths = [app.getPath("userData"), await getRecordingsDir(), app.getPath("logs")];
	if (process.platform === "darwin") {
		// Core ML's compiled copy of the filler-detector model.
		paths.push(path.join(os.homedir(), "Library", "Caches", "recordly-filler-detector"));
	}
	return paths;
}

/** Library and recent projects, plus whatever is recording or open right now. */
async function unusedRecordingOptions(): Promise<UnusedRecordingOptions> {
	if (
		isHudRecordingInProgress() ||
		state.nativeScreenRecordingActive ||
		state.ffmpegScreenRecordingActive ||
		state.windowsNativeCaptureActive ||
		state.countdownInProgress
	)
		throw new Error("Finish or stop the recording first, then try again.");
	const recordingsDir = await getRecordingsDir();
	const active = [
		state.currentProjectPath,
		state.currentVideoPath,
		state.currentRecordingSession?.videoPath,
		state.currentRecordingSession?.webcamPath,
		state.nativeCaptureTargetPath,
		state.nativeCaptureSystemAudioPath,
		state.nativeCaptureMicrophonePath,
		state.windowsCaptureTargetPath,
		state.windowsSystemAudioPath,
		state.windowsMicAudioPath,
		state.windowsOrphanedMicAudioPath,
		state.windowsPendingVideoPath,
		state.ffmpegCaptureTargetPath,
	].filter((value): value is string => typeof value === "string" && value.length > 0);
	return {
		recordingsDir,
		projectFiles: [
			...(await listLibraryProjectFiles(recordingsDir)),
			...(await loadRecentProjectPaths()),
			...(state.currentProjectPath ? [state.currentProjectPath] : []),
		],
		activePaths: active,
		minAgeMs: UNUSED_MIN_AGE_MS,
	};
}

export function registerStorageHandlers() {
	ipcMain.handle("get-local-storage-usage", async () => {
		try {
			if (!cached || Date.now() - cached.at > CACHE_MS) {
				const bytes = dataPaths().then(measureLocalStorage);
				cached = { at: Date.now(), bytes };
				bytes.catch(() => {
					cached = null;
				});
			}
			return { success: true, bytes: await cached.bytes };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
	ipcMain.handle("find-unused-recordings", async () => {
		try {
			const value = await findUnusedRecordings(await unusedRecordingOptions());
			// Lets Home show each recording's poster frame.
			for (const group of value) await rememberApprovedLocalReadPath(group.path);
			return { success: true, value };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
	ipcMain.handle("trash-unused-recordings", async (_, paths: unknown) => {
		try {
			const value = await trashUnusedRecordings(paths, {
				...(await unusedRecordingOptions()),
				trash: (file) => shell.trashItem(file),
			});
			cached = null;
			return { success: true, value };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
