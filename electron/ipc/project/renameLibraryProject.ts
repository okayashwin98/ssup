import fs from "node:fs/promises";
import path from "node:path";
import { ownsProjectFolder, removeFolderIfEmpty } from "./projectMedia";

/** Where a renamed project goes: a new folder of its own, or beside the old file. */
export function getRenamedProjectPath(source: string, name: string, recordingsDir?: string) {
	const clean = name.trim();
	return recordingsDir !== undefined && ownsProjectFolder(recordingsDir, source)
		? path.join(recordingsDir, clean, `${clean}${path.extname(source)}`)
		: path.join(path.dirname(source), `${clean}${path.extname(source)}`);
}

/**
 * Renames a library project. One in its own folder moves into a new folder named after it;
 * its recordings follow when the project is next filed (see reconcileProjectFolder).
 */
export async function renameLibraryProject(
	source: string,
	name: string,
	allowedPaths: string[],
	sidecars: (path: string) => string[],
	recordingsDir?: string,
) {
	if (!allowedPaths.includes(source)) throw new Error("Project is not in the library");
	const clean = name.trim();
	if (
		!clean ||
		clean === "." ||
		clean === ".." ||
		/[<>:"/\\|?*]/.test(clean) ||
		[...clean].some((char) => char.charCodeAt(0) < 32) ||
		/[. ]$/.test(clean)
	)
		throw new Error("Choose a valid project name");
	const target = getRenamedProjectPath(source, clean, recordingsDir);
	if (target === source) return target;
	const newFolder = path.dirname(target) !== path.dirname(source);
	// Creating the folder claims the name; it never joins an existing folder.
	if (newFolder) await fs.mkdir(path.dirname(target));
	const created: string[] = [];
	try {
		// An exclusive link prevents a rename from overwriting another project.
		await fs.link(source, target);
		created.push(target);
		const previous = sidecars(source),
			next = sidecars(target);
		for (let i = 0; i < previous.length; i++) {
			try {
				await fs.copyFile(previous[i], next[i], fs.constants.COPYFILE_EXCL);
				created.push(next[i]);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		await fs.unlink(source);
	} catch (error) {
		await Promise.all(created.map((file) => fs.rm(file, { force: true })));
		if (newFolder) await fs.rmdir(path.dirname(target)).catch(() => undefined);
		throw error;
	}
	// Auxiliary files can be cleaned up independently once the project has moved.
	await Promise.all(
		sidecars(source).map((file) => fs.rm(file, { force: true }).catch(() => undefined)),
	);
	// A folder left with no recordings goes too.
	if (newFolder) await removeFolderIfEmpty(path.dirname(source)).catch(() => undefined);
	return target;
}
