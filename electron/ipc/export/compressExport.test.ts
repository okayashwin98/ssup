import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import {
	buildCompressArgs,
	COMPRESS_CRF,
	compressExportedVideo,
	parseFfmpegDuration,
	parseProgressFraction,
} from "./compressExport";

describe("compressing an export", () => {
	it("re-encodes the video with x264 at a set quality and copies the sound", () => {
		const args = buildCompressArgs("/tmp/in.mp4", "/tmp/out.mp4");
		expect(args).toEqual(
			expect.arrayContaining([
				"-c:v",
				"libx264",
				"-crf",
				String(COMPRESS_CRF),
				"-c:a",
				"copy",
			]),
		);
		expect(args.join(" ")).toContain("-movflags +faststart");
		expect(args.at(-1)).toBe("/tmp/out.mp4");
	});

	it("reads FFmpeg's length and progress lines", () => {
		const duration = parseFfmpegDuration(
			"  Duration: 00:02:46.33, start: 0.000000, bitrate: 13359 kb/s",
		);
		expect(duration).toBeCloseTo(166.33);
		expect(
			parseProgressFraction("frame=10\nout_time_us=83165000\nprogress=continue\n", duration),
		).toBeCloseTo(0.5, 2);
		expect(parseProgressFraction("progress=continue\n", duration)).toBeNull();
		expect(parseProgressFraction("out_time_us=1\n", null)).toBeNull();
	});

	it.skipIf(!ffmpegPath || process.platform !== "darwin")(
		"makes a real, smaller file, and keeps the original when asked to stop",
		async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-export-test-"));
			const input = path.join(dir, "export.mp4");
			// Two seconds of a mostly still screen, written at a wasteful fixed bitrate.
			execFileSync(ffmpegPath as string, [
				"-y",
				"-loglevel",
				"error",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=size=1280x720:rate=30:duration=2",
				"-f",
				"lavfi",
				"-i",
				"sine=duration=2",
				"-c:v",
				"libx264",
				"-b:v",
				"20M",
				"-c:a",
				"aac",
				"-shortest",
				input,
			]);
			const progress: number[] = [];
			const result = await compressExportedVideo({
				ffmpegPath: ffmpegPath as string,
				inputPath: input,
				outputPath: path.join(dir, "export-small.mp4"),
				onProgress: (fraction) => progress.push(fraction),
			});
			expect(result.compressed).toBe(true);
			if (!result.compressed) return;
			expect(result.outputBytes).toBeLessThan(result.inputBytes);
			expect(progress.at(-1)).toBe(1);
			// x264 video, with the sound still there.
			const info = spawnSync(
				ffmpegPath as string,
				["-hide_banner", "-i", result.outputPath],
				{
					encoding: "utf8",
				},
			).stderr;
			expect(info).toMatch(/Video: h264/);
			expect(info).toMatch(/Audio: aac/);

			const controller = new AbortController();
			controller.abort();
			const stopped = await compressExportedVideo({
				ffmpegPath: ffmpegPath as string,
				inputPath: input,
				outputPath: path.join(dir, "stopped.mp4"),
				signal: controller.signal,
			});
			expect(stopped).toMatchObject({ compressed: false, reason: "canceled" });
			expect(fs.existsSync(path.join(dir, "stopped.mp4"))).toBe(false);
			expect(fs.existsSync(input)).toBe(true);
			fs.rmSync(dir, { recursive: true, force: true });
		},
		60_000,
	);
});
