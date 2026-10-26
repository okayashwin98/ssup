// Builds the Liquid Glass add-on for both Mac chip types into electron/native/bin.
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin") {
	console.log("[build-liquid-glass] Skipping: host platform is not macOS.");
	process.exit(0);
}

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "electron", "native", "liquid-glass");
const electronVersion = JSON.parse(
	await readFile(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
).version;
const nodeGyp = path.join(projectRoot, "node_modules", "node-gyp", "bin", "node-gyp.js");

for (const [arch, archTag] of [
	["arm64", "darwin-arm64"],
	["x64", "darwin-x64"],
]) {
	const result = spawnSync(
		process.execPath,
		[
			nodeGyp,
			"rebuild",
			`--target=${electronVersion}`,
			"--dist-url=https://electronjs.org/headers",
			`--arch=${arch}`,
		],
		{ cwd: sourceDir, stdio: "inherit" },
	);
	if (result.status !== 0) throw new Error(`Liquid Glass add-on failed to build for ${arch}`);
	const outputDir = path.join(projectRoot, "electron", "native", "bin", archTag);
	await mkdir(outputDir, { recursive: true });
	await copyFile(
		path.join(sourceDir, "build", "Release", "recordly_liquid_glass.node"),
		path.join(outputDir, "recordly-liquid-glass.node"),
	);
	console.log(`[build-liquid-glass] Built ${archTag}/recordly-liquid-glass.node`);
}
