import os from "node:os";
import path from "node:path";
import { app, ipcMain } from "electron";
import { measureLocalStorage } from "../storage/localStorage";
import { getRecordingsDir } from "../utils";

const CACHE_MS = 60_000;
let cached: { at: number; bytes: Promise<number> } | null = null;

/** Every folder the app keeps your data in: recordings, projects, models, caches, logs. */
async function dataPaths(): Promise<string[]> {
	const paths = [app.getPath("userData"), await getRecordingsDir(), app.getPath("logs")];
	if (process.platform === "darwin") {
		// Core ML's compiled copy of the filler-detector model.
		paths.push(path.join(os.homedir(), "Library", "Caches", "recordly-filler-detector"));
	}
	return paths;
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
}
