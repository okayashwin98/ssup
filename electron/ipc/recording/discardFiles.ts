import fs from "node:fs/promises";
import path from "node:path";
import { belongsToRecording } from "./recordingFiles";

/** The loose files beside this video that belong to its take. Folders are never entered. */
export async function listRecordingFiles(videoPath: string) {
	const folder = path.dirname(videoPath);
	const video = path.basename(videoPath);
	const entries = await fs.readdir(folder, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && belongsToRecording(entry.name, video))
		.map((entry) => path.join(folder, entry.name));
}

/**
 * Permanently deletes a discarded take: its video and every sidecar. Safe to retry.
 * The caller must first check that this is an auto-named take in the recordings folder.
 */
export async function discardRecordingFiles(videoPath: string) {
	const files = await listRecordingFiles(videoPath);
	await Promise.all(files.map((file) => fs.rm(file, { force: true })));
	return files;
}
