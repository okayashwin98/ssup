import path from "node:path";
import fs from "node:fs/promises";
import { getProjectBackupPath } from "./atomicSave";
import { getProjectMediaToTrash } from "./projectMedia";

type Dependencies = {
	list: () => Promise<{ entries: Array<{ path: string }> }>;
	trash: (path: string) => Promise<void>;
	thumbnailPath: (path: string) => string;
	/** When set, each project's raw recordings go to Trash with it unless another project uses them. */
	recordingsDir?: string;
};
/**
 * Only library project files may be trashed, with the raw recordings only they use.
 * Sidecars already trashed with the project's folder are skipped as missing.
 */
export async function trashLibraryProjects(paths: unknown, deps: Dependencies) {
	if (
		!Array.isArray(paths) ||
		!paths.length ||
		paths.length > 500 ||
		paths.some((p) => typeof p !== "string")
	)
		throw new Error("Invalid project selection");
	const libraryPaths = (await deps.list()).entries.map((e) => path.resolve(e.path));
	const allowed = new Set(libraryPaths);
	const selected = [...new Set((paths as string[]).map((p) => path.resolve(p)))];
	if (selected.some((p) => !allowed.has(p))) throw new Error("Project is not in the library");
	const deleted: string[] = [];
	const errors: string[] = [];
	const trashedMedia: string[] = [];
	const remaining = libraryPaths.filter((p) => !selected.includes(p));
	for (const projectPath of selected) {
		try {
			// Read what the project uses before its file goes to Trash.
			const media = deps.recordingsDir
				? await getProjectMediaToTrash(deps.recordingsDir, projectPath, remaining).catch(
						() => [] as string[],
					)
				: [];
			// A folder holding the project file goes to Trash once, file, backups and preview included.
			const folder = path.dirname(projectPath);
			if (media.includes(folder)) {
				await deps.trash(folder);
				trashedMedia.push(folder);
				media.splice(media.indexOf(folder), 1);
			} else {
				await deps.trash(projectPath);
			}
			deleted.push(projectPath);
			for (const sidecar of [
				deps.thumbnailPath(projectPath),
				getProjectBackupPath(projectPath),
			]) {
				try {
					await fs.access(sidecar);
					await deps.trash(sidecar);
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== "ENOENT")
						errors.push(`Could not trash project sidecar: ${sidecar}`);
				}
			}
			for (const item of media) {
				try {
					await deps.trash(item);
					trashedMedia.push(item);
				} catch {
					errors.push(`Could not trash recording: ${path.basename(item)}`);
				}
			}
		} catch {
			errors.push(`Could not trash ${path.basename(projectPath)}`);
		}
	}
	return { deleted, errors, trashedMedia };
}
