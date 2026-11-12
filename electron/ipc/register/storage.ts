import os from "node:os";
import path from "node:path";
import { app, ipcMain } from "electron";
import { type LocalStorageUsage, measureLocalStorage } from "../storage/localStorage";
import { getRecordingsDir } from "../utils";

const CACHE_MS = 60_000;
let cached: { at: number; usage: Promise<LocalStorageUsage> } | null = null;

/** The app itself plus every folder it writes to. */
async function appStoragePaths(): Promise<string[]> {
	const paths = [app.getPath("userData"), await getRecordingsDir(), app.getPath("logs")];
	if (process.platform === "darwin") {
		// Core ML's compiled copy of the filler-detector model.
		paths.push(path.join(os.homedir(), "Library", "Caches", "recordly-filler-detector"));
	}
	if (app.isPackaged) {
		// macOS: …/SuperShare.app/Contents/MacOS/SuperShare → the .app bundle. Elsewhere: the install folder.
		const exe = app.getPath("exe");
		paths.push(
			process.platform === "darwin" ? path.resolve(exe, "..", "..", "..") : path.dirname(exe),
		);
	}
	return paths;
}

export function registerStorageHandlers() {
	ipcMain.handle("get-local-storage-usage", async () => {
		try {
			if (!cached || Date.now() - cached.at > CACHE_MS) {
				const usage = appStoragePaths().then((paths) =>
					measureLocalStorage(paths, os.homedir()),
				);
				cached = { at: Date.now(), usage };
				usage.catch(() => {
					cached = null;
				});
			}
			return { success: true, ...(await cached.usage) };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
