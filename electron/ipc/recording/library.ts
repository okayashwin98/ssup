import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { shell } from "electron";
import { buildMediaUrl, getMediaServerBaseUrl } from "../../mediaServer";
import { rememberApprovedLocalReadPath } from "../project/manager";
import { getRecordingsDir } from "../utils";
import { getCachedMediaDurationMs } from "./mediaDuration";
import { belongsToRecording } from "./recordingFiles";
import type { RecordingLibraryEntry } from "../../../src/types/recordingLibrary";

let mutation = Promise.resolve();
const undoBatches = new Map<string, { bundle: string; files: string[] }>();
const isRecording = (name: string) =>
	/\.(mp4|mov|webm|mkv|m4v)$/i.test(name) && !/[.-]webcam[.-]/i.test(name);
const batchKey = (paths: string[]) => JSON.stringify([...new Set(paths)].sort());

export function listRecordings(includeSources = false): Promise<RecordingLibraryEntry[]> {
	const task = mutation.then(async () => {
		const root = await fs.realpath(await getRecordingsDir());
		const server = getMediaServerBaseUrl();
		if (!server) throw new Error("Media server is not ready. Try again.");
		const entries = await fs.readdir(root, { withFileTypes: true });
		for (const entry of entries) {
			const staged = path.join(root, entry.name);
			if (
				entry.isDirectory() &&
				/^\.recordly-trash-[A-Za-z0-9]{6}$/.test(entry.name) &&
				![...undoBatches.values()].some((batch) => batch.bundle === staged)
			) {
				await shell.trashItem(staged);
			}
		}
		const result: RecordingLibraryEntry[] = [];
		const isListed = (name: string) =>
			includeSources
				? /\.(mp4|mov|webm|mkv|m4v|wav|m4a|mp3|ogg|flac)$/i.test(name)
				: isRecording(name);
		// Loose files plus one level of project folders (never the Projects folder or hidden ones).
		const locations: Array<{ dir: string; folder?: string }> = [{ dir: root }];
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "Projects")
				locations.push({ dir: path.join(root, entry.name), folder: entry.name });
		}
		for (const location of locations) {
			const files =
				location.dir === root
					? entries
					: await fs.readdir(location.dir, { withFileTypes: true }).catch(() => []);
			for (const entry of files) {
				if (!entry.isFile() || !isListed(entry.name)) continue;
				const filePath = path.join(location.dir, entry.name);
				const stat = await fs.stat(filePath);
				if (!stat.size) continue;
				await rememberApprovedLocalReadPath(filePath);
				result.push({
					path: filePath,
					name: entry.name,
					bytes: stat.size,
					durationMs: await getCachedMediaDurationMs(filePath, stat),
					createdAt: stat.mtimeMs,
					url: buildMediaUrl(server, filePath),
					...(location.folder ? { folder: location.folder } : {}),
				});
			}
		}
		return result.sort((a, b) => b.createdAt - a.createdAt);
	});
	mutation = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}

/** Stage a bundle by rename for Undo; the next removal or app exit sends it to Trash. */
export function setRecordingsRemoved(paths: string[], removed: boolean): Promise<void> {
	const task = mutation.then(async () => {
		if (
			typeof removed !== "boolean" ||
			!Array.isArray(paths) ||
			!paths.length ||
			paths.some((value) => typeof value !== "string")
		)
			throw new Error("Invalid recording selection");
		const root = await fs.realpath(await getRecordingsDir());
		const selected = [...new Set(paths)];
		for (const candidate of selected) {
			if (path.dirname(candidate) !== root || !isRecording(path.basename(candidate)))
				throw new Error("Recording is outside the Videos library");
		}
		const key = batchKey(selected);
		if (!removed) {
			const batch = undoBatches.get(key);
			if (!batch)
				throw new Error(
					"This removal can no longer be undone. Restore the files from Trash.",
				);
			// Check every destination before restoring any file; never overwrite newer media.
			for (const file of batch.files) {
				if (
					await fs.lstat(file).then(
						() => true,
						(error) => {
							if (error.code === "ENOENT") return false;
							throw error;
						},
					)
				)
					throw new Error(
						"A file with this name already exists. Restore it from Trash instead.",
					);
			}
			const restored: string[] = [];
			try {
				for (const file of batch.files) {
					const staged = path.join(batch.bundle, path.basename(file));
					try {
						await fs.link(staged, file);
					} catch (error) {
						if (
							!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(
								(error as NodeJS.ErrnoException).code ?? "",
							)
						)
							throw error;
						await fs.copyFile(staged, file, constants.COPYFILE_EXCL);
					}
					restored.push(file);
				}
			} catch (error) {
				await Promise.all(restored.map((file) => fs.unlink(file)));
				throw error;
			}
			undoBatches.delete(key);
			await fs.rm(batch.bundle, { recursive: true, force: true });
			return;
		}
		const available = await fs.readdir(root, { withFileTypes: true });
		for (const file of selected) {
			if (!available.some((entry) => entry.name === path.basename(file) && entry.isFile()))
				throw new Error("Recording is missing or is not a regular file");
		}
		const files = available
			.filter(
				(entry) =>
					entry.isFile() &&
					selected.some((file) => belongsToRecording(entry.name, path.basename(file))),
			)
			.map((entry) => path.join(root, entry.name));
		await finishPendingTrash();
		const bundle = await fs.mkdtemp(path.join(root, ".recordly-trash-"));
		const moved: string[] = [];
		try {
			for (const file of files) {
				await fs.rename(file, path.join(bundle, path.basename(file)));
				moved.push(file);
			}
			undoBatches.set(key, { bundle, files });
		} catch (error) {
			for (const file of moved) await fs.rename(path.join(bundle, path.basename(file)), file);
			await fs.rmdir(bundle);
			throw error;
		}
	});
	mutation = task.catch(() => undefined);
	return task;
}

async function finishPendingTrash() {
	for (const [key, batch] of undoBatches) {
		await shell.trashItem(batch.bundle);
		undoBatches.delete(key);
	}
}
export function clearRecordingTrashUndo() {
	const task = mutation.then(finishPendingTrash);
	mutation = task.catch(() => undefined);
	return task;
}
