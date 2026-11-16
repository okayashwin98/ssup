import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLocalMediaServerPath } from "../../../src/lib/localMediaUrl";
import type { UnusedRecording } from "../../../src/types/recordingLibrary";
import { belongsToRecording } from "../recording/recordingFiles";
import { getProjectBackupPath } from "./atomicSave";
import { collectRecordingGroup, isReservedProjectFolderName } from "./projectMedia";

/** Only files SuperShare names itself when recording; nothing else in the folder is ever offered. */
const OWN_FILE = /^recording-\d+/i;
const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;
const isMainVideo = (name: string) => VIDEO.test(name) && !/[.-]webcam[.-]/i.test(name);

export type UnusedRecordingOptions = {
	recordingsDir: string;
	/** Saved projects anywhere; each one's `.bak` is read too. A missing file is skipped. */
	projectFiles: string[];
	/** Files in use right now: a recording in progress, the editor's open media. */
	activePaths?: string[];
	/** Anything changed more recently than this is left alone. */
	minAgeMs: number;
	now?: number;
	/** Only the recordings folder itself, not project folders (the launch sweep). */
	looseOnly?: boolean;
};

/** Every file name a project mentions: absolute paths, file:// and local media links, bare names. */
function collectNames(value: unknown, names: Set<string>) {
	if (typeof value === "string") {
		let file = getLocalMediaServerPath(value) ?? value;
		if (/^file:\/\//i.test(file)) {
			try {
				file = fileURLToPath(file);
			} catch {
				// Keep the raw text; its last part is still matched below.
			}
		}
		const name = file.split(/[\\/]/).pop()?.split(/[?#]/)[0];
		if (name && OWN_FILE.test(name)) names.add(name.normalize("NFC").toLowerCase());
	} else if (Array.isArray(value)) {
		for (const item of value) collectNames(item, names);
	} else if (value && typeof value === "object") {
		for (const item of Object.values(value)) collectNames(item, names);
	}
}

async function readProjectNames(file: string, names: Set<string>) {
	let text: string;
	try {
		text = await fs.readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw new Error(`"${path.basename(file)}" could not be read, so nothing was moved.`);
	}
	try {
		collectNames(JSON.parse(text.replace(/^﻿/, "")), names);
	} catch {
		throw new Error(`"${path.basename(file)}" could not be read, so nothing was moved.`);
	}
}

/**
 * Recordings no saved project uses, grouped with their cursor, audio, camera and cleaned-voice
 * files. Protection is by file name in every folder, so a project whose recording moved still
 * keeps a same-named copy. Throws, offering nothing, if any saved project can't be read.
 */
export async function findUnusedRecordings(
	options: UnusedRecordingOptions,
): Promise<UnusedRecording[]> {
	const names = new Set<string>();
	for (const project of new Set(options.projectFiles)) {
		await readProjectNames(project, names);
		await readProjectNames(getProjectBackupPath(project), names);
	}
	for (const active of options.activePaths ?? []) collectNames(active, names);
	const referenced = [...names];
	const now = options.now ?? Date.now();
	const root = options.recordingsDir;
	const folders: Array<{ dir: string; folder?: string }> = [{ dir: root }];
	if (!options.looseOnly) {
		for (const entry of await fs.readdir(root, { withFileTypes: true })) {
			if (entry.isDirectory() && !isReservedProjectFolderName(entry.name))
				folders.push({ dir: path.join(root, entry.name), folder: entry.name });
		}
	}

	const result: UnusedRecording[] = [];
	for (const { dir, folder } of folders) {
		const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
		const own = entries.filter((entry) => entry.isFile() && OWN_FILE.test(entry.name));
		if (!own.length) continue;
		// A used recording keeps its whole group, including a camera file its session names.
		const protectedFiles = new Set(
			(
				await collectRecordingGroup(
					dir,
					referenced.map((name) => path.join(dir, name)),
				)
			).map((file) => path.basename(file).toLowerCase()),
		);
		const stats = new Map<string, { bytes: number; modifiedAt: number }>();
		const candidates = new Set<string>();
		for (const entry of own) {
			const lower = entry.name.normalize("NFC").toLowerCase();
			if (
				protectedFiles.has(lower) ||
				referenced.some((name) => belongsToRecording(lower, name))
			)
				continue;
			const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null);
			if (!stat?.isFile()) continue;
			stats.set(entry.name, { bytes: stat.size, modifiedAt: stat.mtimeMs });
			candidates.add(entry.name);
		}
		const fresh = (name: string) =>
			now - (stats.get(name)?.modifiedAt ?? now) < options.minAgeMs;
		const grouped = new Set<string>();
		const groups: string[][] = [];
		for (const name of [...candidates].filter(isMainVideo)) {
			const group = (await collectRecordingGroup(dir, [path.join(dir, name)]))
				.map((file) => path.basename(file))
				.filter((member) => candidates.has(member) && !grouped.has(member));
			for (const member of group) grouped.add(member);
			groups.push([name, ...group.filter((member) => member !== name)]);
		}
		for (const name of candidates) if (!grouped.has(name)) groups.push([name]);
		for (const group of groups) {
			// Something still being written (a recording, a cleaned voice) holds back its group.
			if (group.some(fresh)) continue;
			const files = group.map((name) => ({
				path: path.join(dir, name),
				bytes: stats.get(name)?.bytes ?? 0,
			}));
			result.push({
				path: files[0].path,
				name: group[0],
				...(folder ? { folder } : {}),
				files,
				bytes: files.reduce((sum, file) => sum + file.bytes, 0),
				modifiedAt: Math.max(...group.map((name) => stats.get(name)?.modifiedAt ?? 0)),
			});
		}
	}
	return result.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * Moves the chosen recordings (by their `path`) to the Trash after checking again, so one a
 * project started using since the list was shown is kept. Never deletes anything for good.
 */
export async function trashUnusedRecordings(
	selected: unknown,
	options: UnusedRecordingOptions & { trash: (file: string) => Promise<void> },
) {
	if (
		!Array.isArray(selected) ||
		!selected.length ||
		selected.length > 5000 ||
		selected.some((value) => typeof value !== "string")
	)
		throw new Error("Invalid recording selection");
	const current = new Map(
		(await findUnusedRecordings(options)).map((group) => [group.path, group]),
	);
	const trashed: string[] = [];
	const kept: string[] = [];
	const failed: string[] = [];
	let bytes = 0;
	for (const chosen of new Set(selected as string[])) {
		const group = current.get(chosen);
		if (!group) {
			kept.push(chosen);
			continue;
		}
		for (const file of group.files) {
			try {
				await options.trash(file.path);
				trashed.push(file.path);
				bytes += file.bytes;
			} catch {
				failed.push(file.path);
			}
		}
	}
	return { trashed, kept, failed, bytes };
}
