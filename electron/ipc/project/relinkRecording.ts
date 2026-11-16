import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIRECTORY_NAME } from "./projectFileNames";
import {
	collectRecordingGroup,
	getProjectMediaFolder,
	getReferencedPaths,
	rewriteProjectPaths,
} from "./projectMedia";

/** The video files the app accepts when you import a recording. */
export const RELINK_VIDEO_EXTENSIONS = ["webm", "mp4", "mov", "avi", "mkv"];

export const RELINK_ERRORS = {
	invalid: "Choose a readable video recording.",
	tooShort: "This recording is too short for the saved edits.",
	changed: "The project changed while locating its recording. Try again.",
	available: "The project’s recording is available again. Try again to open it.",
	noSpace:
		"There isn’t enough free space to copy the recording into the project’s folder. Nothing was copied.",
	unreadableProject: "This project couldn’t be read.",
} as const;

/** How long the recording must be for every saved clip, trim and undo step to still fit. */
export function requiredRecordingDurationMs(project: Record<string, unknown>): number {
	let required = 0;
	const visit = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			for (const entry of value) visit(entry);
			return;
		}
		const item = value as Record<string, unknown>;
		const { startMs, endMs, sourceStartMs, speed, sourceMaxMs } = item;
		if (typeof startMs === "number" && typeof endMs === "number") {
			const start = typeof sourceStartMs === "number" ? sourceStartMs : startMs;
			const rate = typeof speed === "number" && speed > 0 ? speed : 1;
			const end = start + Math.max(0, endMs - startMs) * rate;
			if (Number.isFinite(end)) required = Math.max(required, end);
			if (typeof sourceMaxMs === "number" && Number.isFinite(sourceMaxMs))
				required = Math.max(required, sourceMaxMs);
		}
		for (const nested of Object.values(item)) visit(nested);
	};
	const editor = (project.editor ?? {}) as Record<string, unknown>;
	// Music, captions and annotations may run past the recording; only clips and trims read it.
	visit(editor.clipRegions);
	visit(editor.trimRegions);
	const history = project.history as
		| {
				version?: unknown;
				values?: unknown[];
				past?: unknown[];
				current?: unknown;
				future?: unknown[];
		  }
		| undefined;
	if (history?.version === 1 && Array.isArray(history.values)) {
		for (const snapshot of [
			...(Array.isArray(history.past) ? history.past : []),
			history.current,
			...(Array.isArray(history.future) ? history.future : []),
		]) {
			if (!snapshot || typeof snapshot !== "object") continue;
			const clips = (snapshot as { clipRegions?: unknown }).clipRegions;
			if (!Array.isArray(clips)) continue;
			for (const id of clips)
				if (Number.isInteger(id) && id >= 0 && id < history.values.length)
					visit(history.values[id]);
		}
	}
	return required;
}

function stemOf(name: string) {
	return name.slice(0, name.length - path.extname(name).length);
}

async function exists(filePath: string) {
	return fs.lstat(filePath).then(
		() => true,
		() => false,
	);
}

/** The folder a project's recordings sit in: beside its file, or its own folder for an old-layout project. */
export function projectRecordingsFolder(projectPath: string, recordingsDir: string) {
	const folder = path.dirname(path.resolve(projectPath));
	if (
		path.basename(folder) === PROJECTS_DIRECTORY_NAME &&
		path.dirname(folder) === path.resolve(recordingsDir)
	)
		return getProjectMediaFolder(recordingsDir, projectPath);
	return folder;
}

export type RelinkDeps = {
	recordingsDir: string;
	/** The native file picker; null when cancelled. */
	chooseRecording: (missingPath: string) => Promise<string | null>;
	/** Length of a video in seconds; 0 or a throw when unreadable. */
	probeDurationSeconds: (filePath: string) => Promise<number>;
	/** Atomic project write that keeps the previous file as `<project>.bak`. */
	writeProject: (projectPath: string, contents: string) => Promise<void>;
	/** Free bytes on the disk holding `folder`. */
	freeBytes?: (folder: string) => Promise<number>;
};

export type RelinkResult =
	| { success: true; videoPath: string; copied: string[] }
	| { success: false; canceled: true };

async function defaultFreeBytes(folder: string) {
	const stats = await fs.statfs(folder);
	return Number(stats.bavail) * Number(stats.bsize);
}

/**
 * Reconnects a project to a recording you choose: checks it is a video long enough for the
 * saved edits, copies it and its own sidecars (cursor, audio, camera, cleaned voice) into the
 * project's folder without overwriting anything, then points the project at the copy. The
 * chosen file stays where it was. Nothing is left half-copied if a step fails.
 */
export async function relinkProjectRecording(
	projectPath: string,
	deps: RelinkDeps,
): Promise<RelinkResult> {
	const target = path.resolve(projectPath);
	const original = await fs.readFile(target, "utf8");
	let project: Record<string, unknown>;
	try {
		project = JSON.parse(original.replace(/^﻿/, ""));
	} catch {
		throw new Error(RELINK_ERRORS.unreadableProject);
	}
	if (
		!project ||
		typeof project !== "object" ||
		typeof project.videoPath !== "string" ||
		!project.editor ||
		typeof project.editor !== "object"
	)
		throw new Error(RELINK_ERRORS.unreadableProject);
	const missingPath = [...getReferencedPaths(project.videoPath)][0];
	if (!missingPath) throw new Error(RELINK_ERRORS.unreadableProject);
	if (await exists(missingPath)) throw new Error(RELINK_ERRORS.available);

	const chosen = await deps.chooseRecording(missingPath);
	if (!chosen) return { success: false, canceled: true };

	// A readable video, long enough for every saved edit.
	const extension = path.extname(chosen).slice(1).toLowerCase();
	const stat = path.isAbsolute(chosen) ? await fs.stat(chosen).catch(() => null) : null;
	if (!stat?.isFile() || !RELINK_VIDEO_EXTENSIONS.includes(extension))
		throw new Error(RELINK_ERRORS.invalid);
	const seconds = await deps.probeDurationSeconds(chosen).catch(() => 0);
	if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(RELINK_ERRORS.invalid);
	// One frame of rounding in the file's stated length is allowed.
	if (seconds * 1000 + 50 < requiredRecordingDurationMs(project))
		throw new Error(RELINK_ERRORS.tooShort);

	const folder = projectRecordingsFolder(target, deps.recordingsDir);
	await fs.mkdir(folder, { recursive: true });
	const chosenFolder = path.dirname(chosen);
	const alreadyInside =
		(await fs.realpath(chosenFolder).catch(() => chosenFolder)) ===
		(await fs.realpath(folder).catch(() => folder));

	// Files to copy, and what each is called in the project's folder.
	const renamed = new Map<string, string>(); // source path → final path
	const created: string[] = [];
	if (!alreadyInside) {
		const sources = await collectRecordingGroup(chosenFolder, [chosen]);
		const videoStem = stemOf(path.basename(chosen));
		// Names are numbered by their recording's name: the video's, or a camera video's the
		// session file names (it can carry a different time).
		const stems = [
			videoStem,
			...sources
				.map((file) => path.basename(file))
				.filter(
					(name) =>
						!name.startsWith(videoStem) &&
						RELINK_VIDEO_EXTENSIONS.includes(path.extname(name).slice(1).toLowerCase()),
				)
				.map(stemOf),
		].filter((stem) => stem.length > 0);
		// Never overwrite: "take.mp4" becomes "take (2).mp4", with its sidecars renamed alike.
		for (let attempt = 1; attempt < 1000; attempt++) {
			const suffix = attempt === 1 ? "" : ` (${attempt})`;
			const nameFor = (name: string) => {
				const prefix = stems
					.filter((stem) => name.startsWith(stem))
					.sort((a, b) => b.length - a.length)[0];
				return prefix ? `${prefix}${suffix}${name.slice(prefix.length)}` : name;
			};
			const plan = sources.map((file) => [
				file,
				path.join(folder, nameFor(path.basename(file))),
			]);
			const taken = await Promise.all(plan.map(([, final]) => exists(final)));
			if (taken.every((value) => !value)) {
				for (const [file, final] of plan) renamed.set(file, final);
				break;
			}
		}
		if (renamed.size !== sources.length)
			throw new Error("Couldn’t find a free file name in the project’s folder.");

		let total = 0;
		for (const file of renamed.keys()) total += (await fs.stat(file)).size;
		const free = await (deps.freeBytes ?? defaultFreeBytes)(folder);
		// Leave room for the project itself and the Mac.
		if (total + 64 * 1024 * 1024 > free) throw new Error(RELINK_ERRORS.noSpace);

		const temporary: Array<[string, string]> = [];
		try {
			for (const [file, final] of renamed) {
				const temp = path.join(folder, `.supershare-relink-${randomUUID()}.tmp`);
				temporary.push([temp, final]);
				if (file.endsWith(".recordly-session.json")) {
					// The session file names its video and camera; keep those names in step.
					const session = await fs.readFile(file, "utf8");
					let contents = session;
					try {
						const data = JSON.parse(session) as Record<string, unknown>;
						for (const key of ["videoFileName", "webcamFileName"]) {
							const name = data[key];
							if (typeof name !== "string") continue;
							const source = path.join(chosenFolder, name);
							const next = renamed.get(source);
							if (next) data[key] = path.basename(next);
						}
						contents = JSON.stringify(data, null, 2);
					} catch {
						// Unreadable session: copy it unchanged.
					}
					await fs.writeFile(temp, contents, { flag: "wx" });
				} else {
					await fs.copyFile(file, temp, fs.constants.COPYFILE_EXCL);
				}
			}
			for (const [temp, final] of temporary) {
				// link() refuses an existing name, so a file that appeared meanwhile is never replaced.
				try {
					await fs.link(temp, final);
					await fs.rm(temp, { force: true });
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "EEXIST") throw error;
					if (await exists(final)) throw error;
					await fs.rename(temp, final);
				}
				created.push(final);
			}
		} catch (error) {
			await Promise.all([
				...temporary.map(([temp]) => fs.rm(temp, { force: true }).catch(() => undefined)),
				...created.map((file) => fs.rm(file, { force: true }).catch(() => undefined)),
			]);
			if ((error as NodeJS.ErrnoException).code === "ENOSPC")
				throw new Error(RELINK_ERRORS.noSpace);
			throw error;
		}
	}
	const newVideo = alreadyInside ? chosen : (renamed.get(chosen) as string);

	try {
		// Point the video at the copy, and any other missing file that has a copied counterpart.
		const missingStem = stemOf(path.basename(missingPath));
		const newStem = stemOf(path.basename(newVideo));
		const finalNames = new Map<string, string>();
		for (const [file, final] of renamed) finalNames.set(path.basename(file), final);
		const pathMap = new Map<string, string>([[missingPath, newVideo]]);
		for (const referenced of getReferencedPaths(project)) {
			if (pathMap.has(referenced) || (await exists(referenced))) continue;
			const name = path.basename(referenced);
			const byStem = name.startsWith(missingStem)
				? path.join(path.dirname(newVideo), `${newStem}${name.slice(missingStem.length)}`)
				: null;
			const replacement =
				(byStem && (await exists(byStem)) ? byStem : null) ?? finalNames.get(name) ?? null;
			if (replacement) pathMap.set(referenced, replacement);
		}
		const next = rewriteProjectPaths(project, (file) => pathMap.get(file) ?? null);
		// Saved elsewhere meanwhile: keep that version, and remove the copies made here.
		if ((await fs.readFile(target, "utf8")) !== original)
			throw new Error(RELINK_ERRORS.changed);
		await deps.writeProject(target, JSON.stringify(next, null, 2));
	} catch (error) {
		await Promise.all(
			created.map((file) => fs.rm(file, { force: true }).catch(() => undefined)),
		);
		throw error;
	}
	return { success: true, videoPath: newVideo, copied: created };
}
