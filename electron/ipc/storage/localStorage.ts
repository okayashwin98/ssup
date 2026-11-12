import fs from "node:fs/promises";
import path from "node:path";

/** Bytes a folder or file takes on disk, like `du`. Missing paths count as 0. */
export async function diskUsage(target: string): Promise<number> {
	let stat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stat = await fs.lstat(target);
	} catch {
		return 0;
	}
	const own = Number(stat.blocks) * 512;
	if (!stat.isDirectory()) return own;
	let entries: string[];
	try {
		entries = await fs.readdir(target);
	} catch {
		return own;
	}
	let total = own;
	// Small batches keep the number of open folders bounded on large libraries.
	for (let i = 0; i < entries.length; i += 32) {
		const sizes = await Promise.all(
			entries.slice(i, i + 32).map((name) => diskUsage(path.join(target, name))),
		);
		for (const size of sizes) total += size;
	}
	return total;
}

/** Drops paths that sit inside another listed path, so nothing is counted twice. */
export function outermostPaths(paths: string[]): string[] {
	const resolved = [...new Set(paths.map((p) => path.resolve(p)))];
	return resolved.filter(
		(candidate) =>
			!resolved.some(
				(other) => other !== candidate && candidate.startsWith(other + path.sep),
			),
	);
}

/** Total bytes on disk taken by the given folders, counting nested ones once. */
export async function measureLocalStorage(paths: string[]): Promise<number> {
	const sizes = await Promise.all(outermostPaths(paths).map(diskUsage));
	return sizes.reduce((sum, size) => sum + size, 0);
}
