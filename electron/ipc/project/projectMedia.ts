import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { belongsToRecording } from "../recording/recordingFiles";

/** Each library project keeps its raw files in `<recordings>/<project name>/`. */
export function getProjectMediaFolder(recordingsDir: string, projectPath: string) {
	return path.join(recordingsDir, path.basename(projectPath, path.extname(projectPath)));
}

/** Names a project may not take because its folder would clash with app folders. */
export function isReservedProjectFolderName(name: string) {
	return name.trim().toLowerCase() === "projects" || name.trim().startsWith(".");
}

function toFsPath(value: string): string | null {
	if (value.startsWith("file://")) {
		try {
			return fileURLToPath(value);
		} catch {
			return null;
		}
	}
	return path.isAbsolute(value) ? path.resolve(value) : null;
}

function collectPaths(value: unknown, out: Set<string>) {
	if (typeof value === "string") {
		const fsPath = toFsPath(value);
		if (fsPath) out.add(fsPath);
	} else if (Array.isArray(value)) {
		for (const item of value) collectPaths(item, out);
	} else if (value && typeof value === "object") {
		for (const item of Object.values(value)) collectPaths(item, out);
	}
}

/** Every absolute file path a project file mentions. */
export function getReferencedPaths(projectData: unknown) {
	const paths = new Set<string>();
	collectPaths(projectData, paths);
	return paths;
}

/** Rewrites paths (plain or file:// form) through `rename`, leaving everything else alone. */
export function rewriteProjectPaths(
	value: unknown,
	rename: (fsPath: string) => string | null,
): unknown {
	if (typeof value === "string") {
		const fsPath = toFsPath(value);
		const next = fsPath ? rename(fsPath) : null;
		if (!next) return value;
		return value.startsWith("file://") ? pathToFileURL(next).href : next;
	}
	if (Array.isArray(value)) return value.map((item) => rewriteProjectPaths(item, rename));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, rewriteProjectPaths(item, rename)]),
		);
	}
	return value;
}

async function exists(filePath: string) {
	return fs.access(filePath).then(
		() => true,
		() => false,
	);
}

async function readJson(filePath: string): Promise<unknown> {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

/**
 * Loose files in the recordings folder that belong to the given recordings:
 * the video, its cursor data, audio sidecars, session file and camera video.
 */
export async function collectRecordingGroup(recordingsDir: string, videos: Iterable<string>) {
	const names = await fs.readdir(recordingsDir, { withFileTypes: true });
	const files = new Set<string>();
	const pending = [...videos].filter((video) => path.dirname(video) === recordingsDir);
	const seen = new Set<string>();
	while (pending.length) {
		const video = pending.pop() as string;
		if (seen.has(video)) continue;
		seen.add(video);
		const base = path.basename(video);
		for (const entry of names) {
			if (entry.isFile() && belongsToRecording(entry.name, base))
				files.add(path.join(recordingsDir, entry.name));
		}
		// A session file can name a camera video recorded with a different timestamp.
		const stem = base.slice(0, -path.extname(base).length);
		const session = path.join(recordingsDir, `${stem}.recordly-session.json`);
		if (await exists(session)) {
			const data = (await readJson(session).catch(() => null)) as {
				webcamFileName?: unknown;
			} | null;
			if (typeof data?.webcamFileName === "string" && !data.webcamFileName.includes("/"))
				pending.push(path.join(recordingsDir, data.webcamFileName));
		}
	}
	return [...files];
}

type WriteProject = (projectPath: string, contents: string) => Promise<void>;

async function rewriteProjectFiles(
	projectPath: string,
	rename: (fsPath: string) => string | null,
	write: WriteProject,
) {
	for (const file of [projectPath, `${projectPath}.bak`]) {
		if (!(await exists(file))) continue;
		const data = await readJson(file);
		await write(file, JSON.stringify(rewriteProjectPaths(data, rename), null, 2));
	}
}

/**
 * Moves a project's loose raw files into its folder and points the project at them.
 * Files outside the recordings folder (imported media) are never moved.
 */
export async function moveProjectMediaIntoFolder(
	projectPath: string,
	recordingsDir: string,
	write: WriteProject,
) {
	const folder = getProjectMediaFolder(recordingsDir, projectPath);
	if (isReservedProjectFolderName(path.basename(folder)))
		throw new Error("This project name is reserved");
	const referenced = [...getReferencedPaths(await readJson(projectPath))].filter(
		(file) => path.dirname(file) === recordingsDir,
	);
	const files = await collectRecordingGroup(recordingsDir, referenced);
	if (!files.length) return { moved: [] as string[] };
	await fs.mkdir(folder, { recursive: true });
	for (const file of files) {
		if (await exists(path.join(folder, path.basename(file))))
			throw new Error(`"${path.basename(file)}" already exists in the project's folder`);
	}
	const moved: string[] = [];
	try {
		for (const file of files) {
			await fs.rename(file, path.join(folder, path.basename(file)));
			moved.push(file);
		}
		const movedSet = new Set(moved);
		await rewriteProjectFiles(
			projectPath,
			(file) => (movedSet.has(file) ? path.join(folder, path.basename(file)) : null),
			write,
		);
	} catch (error) {
		for (const file of moved)
			await fs.rename(path.join(folder, path.basename(file)), file).catch(() => undefined);
		throw error;
	}
	return { moved };
}

/** Throws before anything changes if the renamed project's folder can't be created. */
export async function assertProjectFolderRenameAllowed(
	recordingsDir: string,
	sourceProjectPath: string,
	targetProjectPath: string,
) {
	const target = getProjectMediaFolder(recordingsDir, targetProjectPath);
	if (isReservedProjectFolderName(path.basename(target)))
		throw new Error("This name is reserved for an app folder. Choose another name.");
	const source = getProjectMediaFolder(recordingsDir, sourceProjectPath);
	// Same folder with different capitals is a rename of itself on a case-insensitive disk.
	if (source.toLowerCase() !== target.toLowerCase() && (await exists(target)))
		throw new Error("A recordings folder with this name already exists. Choose another name.");
}

/**
 * Raw files to trash with a project: its folder, plus any loose recordings only it uses.
 * Anything another project still references is kept.
 */
export async function getProjectMediaToTrash(
	recordingsDir: string,
	projectPath: string,
	otherProjectPaths: string[],
) {
	const others = new Set<string>();
	for (const other of otherProjectPaths) {
		const data = await readJson(other).catch(() => null);
		for (const file of getReferencedPaths(data)) others.add(file);
	}
	const usedElsewhere = (file: string) =>
		[...others].some((other) => other === file || other.startsWith(`${file}${path.sep}`));
	const result: string[] = [];
	const folder = getProjectMediaFolder(recordingsDir, projectPath);
	if (!isReservedProjectFolderName(path.basename(folder)) && (await exists(folder))) {
		if (!usedElsewhere(folder)) result.push(folder);
	}
	const data = await readJson(projectPath).catch(() => null);
	const loose = [...getReferencedPaths(data)].filter(
		(file) => path.dirname(file) === recordingsDir,
	);
	const group = await collectRecordingGroup(recordingsDir, loose);
	const groupUsedElsewhere = group.some((file) => usedElsewhere(file));
	if (!groupUsedElsewhere) result.push(...group);
	return result;
}

/**
 * Files a project's raw recordings under its name: loose files move into its folder, and a
 * folder still carrying an old project name is renamed. Only for projects not open in the editor.
 */
export async function reconcileProjectFolder(
	projectPath: string,
	recordingsDir: string,
	write: WriteProject,
	otherProjectPaths: string[],
) {
	await moveProjectMediaIntoFolder(projectPath, recordingsDir, write);
	const target = getProjectMediaFolder(recordingsDir, projectPath);
	const referenced = [...getReferencedPaths(await readJson(projectPath))].filter((file) =>
		file.startsWith(`${recordingsDir}${path.sep}`),
	);
	const folders = new Set(
		referenced
			.map((file) => path.relative(recordingsDir, file).split(path.sep))
			// Only project folders: never the app's Projects folder or hidden ones.
			.filter((parts) => parts.length > 1 && !isReservedProjectFolderName(parts[0]))
			.map((parts) => path.join(recordingsDir, parts[0])),
	);
	if (folders.size !== 1) return;
	const [source] = folders;
	if (source === target || isReservedProjectFolderName(path.basename(target))) return;
	if (await exists(target)) return;
	for (const other of otherProjectPaths) {
		const data = await readJson(other).catch(() => null);
		if ([...getReferencedPaths(data)].some((file) => file.startsWith(`${source}${path.sep}`)))
			return;
	}
	await fs.rename(source, target);
	try {
		await rewriteProjectFiles(
			projectPath,
			(file) =>
				file.startsWith(`${source}${path.sep}`)
					? path.join(target, path.relative(source, file))
					: null,
			write,
		);
	} catch (error) {
		await fs.rename(target, source).catch(() => undefined);
		throw error;
	}
}
