import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getReferencedPaths, moveProjectMediaIntoFolder } from "./projectMedia";

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
	if (loose.length) {
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
	if (!errors.length) await fs.writeFile(marker, `${new Date(options.now ?? Date.now()).toISOString()}\n`);
	return {
		projects: projects.length,
		moved,
		trashed,
		errors,
		backupDir: loose.length ? backupDir : null,
	};
}

/** Loose recordings (and their sidecars) that no project uses go to Trash once old enough. */
export async function trashOrphanRecordings(options: {
	recordingsDir: string;
	projectFiles: string[];
	trash: (filePath: string) => Promise<void>;
	minAgeMs: number;
	now?: number;
}) {
	const referenced = new Set<string>();
	for (const project of options.projectFiles) {
		const data = await fs
			.readFile(project, "utf8")
			.then((text) => JSON.parse(text))
			.catch(() => null);
		for (const file of getReferencedPaths(data)) referenced.add(file);
	}
	const trashed: string[] = [];
	const now = options.now ?? Date.now();
	for (const entry of await fs.readdir(options.recordingsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !/^recording-\d+/.test(entry.name)) continue;
		const file = path.join(options.recordingsDir, entry.name);
		if (referenced.has(file)) continue;
		const stat = await fs.stat(file);
		if (now - stat.mtimeMs < options.minAgeMs) continue;
		await options.trash(file);
		trashed.push(file);
	}
	return trashed;
}
