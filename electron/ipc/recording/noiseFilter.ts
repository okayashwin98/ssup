import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { normalizeNoiseFilterStrength } from "../../../src/lib/noiseFilterStrength";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { resolveUnpackedAppPath } from "../paths/binaries";

const execFileAsync = promisify(execFile);

/** RNNoise's general speech model ("std", richardpl/arnndn-models), run by ffmpeg's arnndn. */
export function getNoiseModelPath() {
	return resolveUnpackedAppPath("electron", "native", "bin", "rnnoise", "std.rnnn");
}

/**
 * Where the cleaned copy of a recording's voice lives: next to it, in the project's folder.
 * "recording-1.mic.m4a" or "recording-1.mp4" at full strength gives
 * "recording-1.mic.clean100.m4a"; the ".mic." keeps it routed as the microphone.
 */
export function getCleanedAudioPath(sourcePath: string, strength: number) {
	const base = sourcePath.replace(/\.[^./\\]+$/, "").replace(/\.mic$/i, "");
	return `${base}.mic.clean${Math.round(normalizeNoiseFilterStrength(strength) * 100)}.m4a`;
}

const pending = new Map<string, Promise<string>>();

/** Makes (once) and returns the cleaned copy of a recording's voice at a strength. */
export function createCleanedAudio(sourcePath: string, strength: number): Promise<string> {
	const outputPath = getCleanedAudioPath(sourcePath, strength);
	const existing = pending.get(outputPath);
	if (existing) return existing;
	const job = (async () => {
		const [source, output] = await Promise.all([
			fs.stat(sourcePath),
			fs.stat(outputPath).catch(() => null),
		]);
		if (output && output.size > 0 && output.mtimeMs >= source.mtimeMs) return outputPath;
		const ffmpeg = getFfmpegBinaryPath();
		if (!ffmpeg) throw new Error("FFmpeg is not available");
		const tempPath = `${outputPath}.part.m4a`;
		const mix = normalizeNoiseFilterStrength(strength);
		try {
			await execFileAsync(
				ffmpeg,
				[
					"-hide_banner",
					"-nostdin",
					"-y",
					"-i",
					sourcePath,
					"-vn",
					"-af",
					`arnndn=m='${getNoiseModelPath().replace(/'/g, "'\\''")}':mix=${mix}`,
					"-c:a",
					"aac",
					"-b:a",
					"192k",
					tempPath,
				],
				{ timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
			);
			await fs.rename(tempPath, outputPath);
			return outputPath;
		} catch (error) {
			await fs.rm(tempPath, { force: true }).catch(() => undefined);
			throw error;
		}
	})().finally(() => pending.delete(outputPath));
	pending.set(outputPath, job);
	return job;
}
