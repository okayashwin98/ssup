import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { moveProjectMediaIntoFolder } from "./projectMedia";
import { findUnusedRecordings } from "./unusedRecordings";

const MARKER = ".project-folders";
// A recording this fresh may still be waiting for its project to be saved.
const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

type Options = {
	recordingsDir: string;
	projectsDir: string;
	backupDir: string;
	trash: (filePath: string) => Promise<void>;
	write: (projectPath: string, contents: string) => Promise<void>;
	/** Projects saved outside the library that may still use loose recordings. */
	extraProjectFiles?: string[];
	now?: number;
};

/**
 * One-time move from loose files to one folder per project, after a full backup.
 * Loose recordings no project uses go to Trash.
 */
export async function migrateRecordingsIntoProjectFolders(options: Options) {
	const { recordingsDir, projectsDir, backupDir, trash, write } = options;
	const marker = path.join(recordingsDir, MARKER);
	if (
		await fs.access(marker).then(
			() => true,
			() => false,
		)
	)
		return null;

	const loose = (await fs.readdir(recordingsDir, { withFileTypes: true })).filter(
		(entry) => entry.isFile() && /^recording-\d+/.test(entry.name),
	);
	// One backup per recordings folder, even if a later launch retries the move.
	const backedUp = await fs.access(backupDir).then(
		() => true,
		() => false,
	);
	if (loose.length && !backedUp) {
		// Clones on APFS: a complete backup that takes no extra space until files change.
		await fs.cp(recordingsDir, backupDir, {
			recursive: true,
			errorOnExist: true,
			force: false,
			mode: fsConstants.COPYFILE_FICLONE,
		});
	}

	const projects = (await fs.readdir(projectsDir).catch(() => [] as string[]))
		.filter((name) => name.endsWith(".recordly"))
		.map((name) => path.join(projectsDir, name));
	const errors: string[] = [];
	let moved = 0;
	for (const project of projects) {
		try {
			moved += (await moveProjectMediaIntoFolder(project, recordingsDir, write)).moved.length;
		} catch (error) {
			errors.push(`${path.basename(project)}: ${String(error)}`);
		}
	}

	const trashed = await trashOrphanRecordings({
		recordingsDir,
		projectFiles: [...projects, ...(options.extraProjectFiles ?? [])],
		trash,
		minAgeMs: ORPHAN_MIN_AGE_MS,
		now: options.now,
	});

	// Leave the marker only when every project moved, so a failure retries next launch.
	if (!errors.length)
		await fs.writeFile(marker, `${new Date(options.now ?? Date.now()).toISOString()}\n`);
	return {
		projects: projects.length,
		moved,
		trashed,
		errors,
		backupDir: loose.length ? backupDir : null,
	};
}

/**
 * The launch sweep: loose recordings (with their companion files) that no project uses go to
 * Trash once old enough. Same rules as Home's "Free up space"; if any project can't be read,
 * nothing moves.
 */
export async function trashOrphanRecordings(options: {
	recordingsDir: string;
	projectFiles: string[];
	trash: (filePath: string) => Promise<void>;
	minAgeMs: number;
	now?: number;
}) {
	let unused: Awaited<ReturnType<typeof findUnusedRecordings>>;
	try {
		unused = await findUnusedRecordings({ ...options, looseOnly: true });
	} catch (error) {
		console.warn("[project-folders] Unused recordings kept:", String(error));
		return [];
	}
	const trashed: string[] = [];
	for (const file of unused.flatMap((group) => group.files)) {
		await options.trash(file.path);
		trashed.push(file.path);
	}
	return trashed;
}
