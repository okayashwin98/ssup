import { spawn } from "node:child_process";
import fs from "node:fs/promises";

// Every MP4 export is re-encoded with x264 at a set quality before it is saved or shared.
// The fast hardware export spends a fixed budget on every frame; aiming for a quality
// instead lets still screens take almost nothing. Measured on a 2:46 screen recording:
// 282 MB → 9.7 MB at the same size, in 37 s, with the picture all but identical
// (SSIM 0.9989 against the hardware export).
export const COMPRESS_CRF = 23;
export const COMPRESS_PRESET = "medium";

export function buildCompressArgs(inputPath: string, outputPath: string): string[] {
	return [
		"-y",
		"-hide_banner",
		"-nostats",
		"-i",
		inputPath,
		// The video and every audio track; sound is copied as it is.
		"-map",
		"0:v:0",
		"-map",
		"0:a?",
		"-map_metadata",
		"0",
		"-c:v",
		"libx264",
		"-preset",
		COMPRESS_PRESET,
		"-crf",
		String(COMPRESS_CRF),
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"copy",
		// The index goes first, so a share link starts playing before it has all downloaded.
		"-movflags",
		"+faststart",
		"-progress",
		"pipe:1",
		outputPath,
	];
}

/** The input's length in seconds, from FFmpeg's "Duration: 00:02:46.33" line. */
export function parseFfmpegDuration(stderr: string): number | null {
	const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
	if (!match) return null;
	const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
	return seconds > 0 ? seconds : null;
}

/** How far FFmpeg's `-progress` output says it is, 0–1, given the input's length. */
export function parseProgressFraction(
	chunk: string,
	durationSeconds: number | null,
): number | null {
	if (!durationSeconds) return null;
	const matches = [...chunk.matchAll(/out_time_us=(\d+)/g)];
	const last = matches[matches.length - 1];
	if (!last) return null;
	return Math.max(0, Math.min(1, Number(last[1]) / 1_000_000 / durationSeconds));
}

export type CompressResult =
	| { compressed: true; outputPath: string; inputBytes: number; outputBytes: number }
	| { compressed: false; reason: string; inputBytes?: number; outputBytes?: number };

/**
 * Re-encodes `inputPath` into `outputPath`. Keeps nothing at `outputPath` unless the
 * result is a working file that is smaller than the input.
 */
export async function compressExportedVideo(options: {
	ffmpegPath: string;
	inputPath: string;
	outputPath: string;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
}): Promise<CompressResult> {
	const { ffmpegPath, inputPath, outputPath, onProgress, signal } = options;
	const inputBytes = (await fs.stat(inputPath)).size;
	const discardOutput = () => fs.rm(outputPath, { force: true }).catch(() => undefined);

	const exitCode = await new Promise<number | null>((resolve, reject) => {
		const child = spawn(ffmpegPath, buildCompressArgs(inputPath, outputPath), {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";
		let duration: number | null = null;
		const onAbort = () => child.kill("SIGKILL");
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stderr.on("data", (data: Buffer) => {
			if (stderr.length < 64_000) stderr += data.toString();
			duration ??= parseFfmpegDuration(stderr);
		});
		child.stdout.on("data", (data: Buffer) => {
			const fraction = parseProgressFraction(data.toString(), duration);
			if (fraction !== null) onProgress?.(fraction);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			signal?.removeEventListener("abort", onAbort);
			if (code !== 0 && !signal?.aborted)
				console.warn("[compress-export] FFmpeg failed:", stderr.slice(-2000));
			resolve(code);
		});
	});

	if (signal?.aborted) {
		await discardOutput();
		return { compressed: false, reason: "canceled", inputBytes };
	}
	if (exitCode !== 0) {
		await discardOutput();
		return { compressed: false, reason: `ffmpeg exited with ${exitCode}`, inputBytes };
	}
	const outputBytes = (await fs.stat(outputPath)).size;
	// Fast motion can leave nothing to gain; then the hardware export stays.
	if (outputBytes <= 0 || outputBytes >= inputBytes) {
		await discardOutput();
		return { compressed: false, reason: "not smaller", inputBytes, outputBytes };
	}
	onProgress?.(1);
	return { compressed: true, outputPath, inputBytes, outputBytes };
}
