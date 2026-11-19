import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createUntitledProject } from "./createUntitledProject";
import { listLibraryProjectFiles } from "./projectMedia";
import { toFileSafeName } from "./recordingProjectName";

export const BATCH_VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "m4v", "avi"];
const MAX_FILES = 2000;
const isVideo = (file: string) =>
	BATCH_VIDEO_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase());

/** Videos among the picked files and inside picked folders (and their subfolders), name order. */
export async function expandMediaPaths(picked: string[]) {
	const found: string[] = [];
	const visit = async (item: string, depth: number) => {
		if (found.length >= MAX_FILES || path.basename(item).startsWith(".")) return;
		const stat = await fs.stat(item).catch(() => null);
		if (stat?.isDirectory()) {
			if (depth > 4) return;
			const children = await fs.readdir(item).catch(() => []);
			children.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
			for (const child of children) await visit(path.join(item, child), depth + 1);
		} else if (stat?.isFile() && stat.size > 0 && isVideo(item)) {
			found.push(path.resolve(item));
		}
	};
	for (const item of picked) await visit(item, 0);
	return [...new Set(found)];
}

/** "name|size" of every video a library project already holds, to skip repeats. */
async function importedKeys(recordingsDir: string) {
	const keys = new Set<string>();
	for (const projectPath of await listLibraryProjectFiles(recordingsDir).catch(() => [])) {
		try {
			const videoPath = JSON.parse(await fs.readFile(projectPath, "utf8"))?.videoPath;
			if (typeof videoPath !== "string") continue;
			const { size } = await fs.stat(videoPath);
			keys.add(`${path.basename(videoPath).toLowerCase()}|${size}`);
		} catch {
			// A broken project can't hold a duplicate.
		}
	}
	return keys;
}

export type BatchImportProgress = { done: number; total: number; name: string };
export type BatchImportResult = {
	imported: string[];
	skipped: string[];
	failed: { name: string; message: string }[];
	canceled: boolean;
};

/**
 * Gives each video its own project, `<recordings>/<name>/<name>.ssup`, with a copy of the
 * video beside it, so the import survives the originals being moved or deleted.
 */
export async function importMediaBatch(
	recordingsDir: string,
	files: string[],
	options: { signal?: AbortSignal; onProgress?: (progress: BatchImportProgress) => void } = {},
): Promise<BatchImportResult> {
	const result: BatchImportResult = { imported: [], skipped: [], failed: [], canceled: false };
	const existing = await importedKeys(recordingsDir);
	for (const [index, source] of files.entries()) {
		if (options.signal?.aborted) {
			result.canceled = true;
			break;
		}
		const name = path.basename(source);
		options.onProgress?.({ done: index, total: files.length, name });
		let projectPath: string | null = null;
		try {
			const { size } = await fs.stat(source);
			const key = `${name.toLowerCase()}|${size}`;
			if (existing.has(key)) {
				result.skipped.push(source);
				continue;
			}
			const title = toFileSafeName(name.replace(/\.[^.]+$/, "")) || "Imported video";
			const project = { version: 2, projectId: randomUUID(), videoPath: source, editor: {} };
			projectPath = await createUntitledProject(
				recordingsDir,
				JSON.stringify(project, null, 2),
				title,
			);
			const folder = path.dirname(projectPath);
			const target = path.join(folder, name);
			const partial = path.join(folder, `.${name}.importing`);
			await fs.copyFile(source, partial, constants.COPYFILE_FICLONE);
			await fs.rename(partial, target);
			const temporary = `${projectPath}.${randomUUID()}.tmp`;
			await fs.writeFile(
				temporary,
				JSON.stringify({ ...project, videoPath: target }, null, 2),
				"utf8",
			);
			await fs.rename(temporary, projectPath);
			existing.add(key);
			result.imported.push(projectPath);
		} catch (error) {
			if (projectPath)
				await fs
					.rm(path.dirname(projectPath), { recursive: true, force: true })
					.catch(() => undefined);
			result.failed.push({
				name,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	options.onProgress?.({
		done: result.canceled
			? result.imported.length + result.skipped.length + result.failed.length
			: files.length,
		total: files.length,
		name: "",
	});
	return result;
}
