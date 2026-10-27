import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { hasProjectFileExtension, PROJECTS_DIRECTORY_NAME } from "./projectFileNames";
import {
	getProjectFilePath,
	isReservedProjectFolderName,
	listLibraryProjectFiles,
	reconcileProjectFolder,
	removeFolderIfEmpty,
} from "./projectMedia";

const MARKER = ".project-files-in-folders";
// What travels with a project file: its backups and its preview.
const COMPANION = /^(\.bak)*(\.preview\.png)?$/;

type Options = {
	recordingsDir: string;
	backupDir: string;
	recentProjectsFile: string;
	/** Old → new paths are added here so the dashboard can follow moved projects. */
	movesFile: string;
	write: (projectPath: string, contents: string) => Promise<void>;
};

const exists = (file: string) =>
	fs.access(file).then(
		() => true,
		() => false,
	);

async function readJson<T>(file: string): Promise<T | null> {
	const text = await fs.readFile(file, "utf8").catch(() => null);
	if (text === null) return null;
	return JSON.parse(text.replace(/^﻿/, "")) as T;
}

/**
 * One-time move of each `Projects/<name>.recordly` (with its backups and preview) into
 * `<recordings>/<name>/<name>.ssup`, after backing up the Projects folder and the recent list.
 * Each project's recordings are filed under its name first. A project whose new name is taken
 * stays where it is. Projects saved elsewhere are never moved.
 */
export async function migrateProjectFilesIntoFolders(options: Options) {
	const { recordingsDir, backupDir, recentProjectsFile, movesFile, write } = options;
	const marker = path.join(recordingsDir, MARKER);
	if (await exists(marker)) return null;
	const projectsDir = path.join(recordingsDir, PROJECTS_DIRECTORY_NAME);
	const projects = (await fs.readdir(projectsDir).catch(() => [] as string[]))
		.filter((name) => hasProjectFileExtension(name))
		.map((name) => path.join(projectsDir, name));

	// One backup per recordings folder, made whole before anything moves.
	if (projects.length && !(await exists(backupDir))) {
		const partial = `${backupDir}.partial-${process.pid}`;
		await fs.rm(partial, { recursive: true, force: true });
		await fs.mkdir(partial, { recursive: true });
		// Clones on APFS: no extra space until files change.
		await fs.cp(projectsDir, path.join(partial, PROJECTS_DIRECTORY_NAME), {
			recursive: true,
			errorOnExist: true,
			force: false,
			mode: fsConstants.COPYFILE_FICLONE,
		});
		await fs
			.copyFile(recentProjectsFile, path.join(partial, path.basename(recentProjectsFile)))
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
		await fs.rename(partial, backupDir);
	}

	const recent =
		(await readJson<{ paths?: unknown }>(recentProjectsFile).catch(() => null))?.paths ?? [];
	const recentPaths = Array.isArray(recent)
		? recent.filter((value): value is string => typeof value === "string")
		: [];
	// Every other project file, so a folder another project uses is never moved.
	const known = new Set([
		...(await listLibraryProjectFiles(recordingsDir)),
		...recentPaths.map((value) => path.resolve(value)),
	]);
	const moves: Record<string, string> = {};
	const skipped: string[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	for (const project of projects) {
		const base = path.basename(project);
		const stem = path.basename(project, path.extname(project));
		try {
			await reconcileProjectFolder(
				project,
				recordingsDir,
				write,
				[...known].filter((other) => other !== project),
			);
		} catch (error) {
			// The file still moves; recordings are filed again at every launch.
			warnings.push(`${base}: recordings not filed: ${String(error)}`);
		}
		if (isReservedProjectFolderName(stem)) {
			skipped.push(`${base}: reserved name`);
			continue;
		}
		const target = getProjectFilePath(recordingsDir, stem);
		const pairs = (await fs.readdir(projectsDir))
			.filter((name) => name.startsWith(base) && COMPANION.test(name.slice(base.length)))
			.map((name) => [path.join(projectsDir, name), `${target}${name.slice(base.length)}`]);
		const taken = [];
		for (const [, to] of pairs) if (await exists(to)) taken.push(path.basename(to));
		if (taken.length) {
			skipped.push(`${base}: ${taken.join(", ")} already exists`);
			continue;
		}
		const moved: string[][] = [];
		try {
			await fs.mkdir(path.dirname(target), { recursive: true });
			for (const [from, to] of pairs) {
				await fs.rename(from, to);
				moved.push([from, to]);
			}
			moves[project] = target;
			known.delete(project);
			known.add(target);
		} catch (error) {
			for (const [from, to] of moved) await fs.rename(to, from).catch(() => undefined);
			errors.push(`${base}: ${String(error)}`);
		}
	}

	if (Object.keys(moves).length) {
		if (recentPaths.length)
			await fs.writeFile(
				recentProjectsFile,
				JSON.stringify(
					{ paths: recentPaths.map((value) => moves[path.resolve(value)] ?? value) },
					null,
					2,
				),
				"utf-8",
			);
		const previous =
			(await readJson<{ moves?: Record<string, string> }>(movesFile).catch(() => null))
				?.moves ?? {};
		await fs.writeFile(
			movesFile,
			JSON.stringify({ moves: { ...previous, ...moves } }, null, 2),
			"utf-8",
		);
	}
	await removeFolderIfEmpty(projectsDir).catch(() => undefined);
	// Leave the marker only when every move worked, so a failure retries next launch.
	if (!errors.length) await fs.writeFile(marker, `${new Date().toISOString()}\n`);
	return {
		projects: projects.length,
		moved: moves,
		skipped,
		warnings,
		errors,
		backupDir: projects.length ? backupDir : null,
	};
}
