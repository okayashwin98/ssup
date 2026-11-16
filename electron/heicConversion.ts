import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export type CommandRunner = (command: string, args: string[]) => Promise<unknown>;

const runCommand: CommandRunner = (command, args) =>
	execFileAsync(command, args, { timeout: 30_000, maxBuffer: 64 * 1024 });

export const MAX_HEIC_BYTES = 200 * 1024 * 1024;

/**
 * Converts HEIC/HEIF image bytes to PNG with macOS's own image converter (`sips`),
 * because Chromium and Electron's nativeImage cannot decode HEIC. Works in a private
 * temporary folder that is always removed; nothing is kept on disk.
 */
export async function convertHeicToPng(
	bytes: Uint8Array,
	platform: NodeJS.Platform = process.platform,
	run: CommandRunner = runCommand,
	tempRoot: string = os.tmpdir(),
): Promise<Uint8Array> {
	if (platform !== "darwin") throw new Error("HEIC conversion needs macOS");
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_HEIC_BYTES) {
		throw new Error("HEIC image is empty or too large");
	}
	const directory = await fs.mkdtemp(path.join(tempRoot, "supershare-heic-"));
	try {
		const source = path.join(directory, "wallpaper.heic");
		const converted = path.join(directory, "wallpaper.png");
		await fs.writeFile(source, bytes, { flag: "wx" });
		await run("/usr/bin/sips", ["-s", "format", "png", source, "--out", converted]);
		const png = await fs.readFile(converted);
		if (png.byteLength === 0) throw new Error("HEIC image could not be decoded");
		return new Uint8Array(png);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}
