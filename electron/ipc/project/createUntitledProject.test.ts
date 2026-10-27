import { afterEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createUntitledProject } from "./createUntitledProject";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
it("publishes complete, uniquely named projects in their own folders under concurrent creation without replacing existing projects", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-new-"));
	dirs.push(dir);
	const existing = path.join(dir, "Untitled Project", "Untitled Project.ssup");
	await fs.mkdir(path.dirname(existing));
	await fs.writeFile(existing, "original");
	// A folder of someone else's recordings is never joined.
	await fs.mkdir(path.join(dir, "Untitled Project 2"));
	await fs.writeFile(path.join(dir, "Untitled Project 2", "recording-1.mp4"), "video");
	const paths = await Promise.all(
		[1, 2, 3].map((n) => createUntitledProject(dir, JSON.stringify({ id: n }))),
	);
	expect(paths.map((p) => path.relative(dir, p)).sort()).toEqual([
		path.join("Untitled Project 1", "Untitled Project 1.ssup"),
		path.join("Untitled Project 3", "Untitled Project 3.ssup"),
		path.join("Untitled Project 4", "Untitled Project 4.ssup"),
	]);
	expect(await fs.readFile(existing, "utf8")).toBe("original");
	expect(await fs.readdir(path.join(dir, "Untitled Project 2"))).toEqual(["recording-1.mp4"]);
	expect(
		(
			await Promise.all(paths.map(async (p) => JSON.parse(await fs.readFile(p, "utf8")).id))
		).sort(),
	).toEqual([1, 2, 3]);
	expect((await fs.readdir(dir)).filter((p) => p.endsWith(".tmp"))).toEqual([]);
});
