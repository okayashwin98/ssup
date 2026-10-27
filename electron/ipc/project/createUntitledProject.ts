import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getProjectFilePath, isReservedProjectFolderName } from "./projectMedia";
/**
 * Publish a complete new project in its own folder, `<recordings>/<name>/<name>.ssup`,
 * without overwriting a concurrent or existing save or joining another project's folder.
 */
export async function createUntitledProject(
	recordingsDir: string,
	contents: string,
	baseName?: string,
) {
	await fs.mkdir(recordingsDir, { recursive: true });
	const temporary = path.join(recordingsDir, `.recordly-new-${randomUUID()}.tmp`);
	try {
		const file = await fs.open(temporary, "wx");
		try {
			await file.writeFile(contents, "utf8");
			await file.sync();
		} finally {
			await file.close();
		}
		for (let suffix = 0; ; suffix++) {
			// Named projects count from 2 ("Figma – Oct 23, 2026 2"); untitled ones keep their numbering.
			const name = baseName
				? `${baseName}${suffix ? ` ${suffix + 1}` : ""}`
				: `Untitled Project${suffix ? ` ${suffix}` : ""}`;
			if (isReservedProjectFolderName(name)) continue;
			const target = getProjectFilePath(recordingsDir, name);
			// Creating the folder claims the name; an existing folder belongs to someone else.
			try {
				await fs.mkdir(path.dirname(target));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				continue;
			}
			try {
				await fs.link(temporary, target);
				return target;
			} catch (error) {
				await fs.rmdir(path.dirname(target)).catch(() => undefined);
				throw error;
			}
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
