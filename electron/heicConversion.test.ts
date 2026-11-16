import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { convertHeicToPng } from "./heicConversion";

describe("HEIC wallpaper conversion", () => {
	it("runs macOS sips on a private temporary copy and always cleans it up", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "heic-test-"));
		const run = vi.fn(async (_command: string, args: string[]) => {
			fs.writeFileSync(args[args.length - 1], Buffer.from([1, 2, 3]));
		});
		const png = await convertHeicToPng(new Uint8Array([9, 9]), "darwin", run, root);
		expect([...png]).toEqual([1, 2, 3]);
		expect(run).toHaveBeenCalledWith("/usr/bin/sips", [
			"-s",
			"format",
			"png",
			expect.stringContaining("wallpaper.heic"),
			"--out",
			expect.stringContaining("wallpaper.png"),
		]);
		expect(fs.readdirSync(root)).toEqual([]);
		const failing = vi.fn(async () => {
			throw new Error("sips failed");
		});
		await expect(
			convertHeicToPng(new Uint8Array([9]), "darwin", failing, root),
		).rejects.toThrow();
		expect(fs.readdirSync(root)).toEqual([]);
		fs.rmSync(root, { recursive: true });
	});

	it("refuses other platforms and empty files", async () => {
		const run = vi.fn();
		await expect(convertHeicToPng(new Uint8Array([1]), "win32", run)).rejects.toThrow();
		await expect(convertHeicToPng(new Uint8Array(), "darwin", run)).rejects.toThrow();
		expect(run).not.toHaveBeenCalled();
	});

	it.runIf(process.platform === "darwin")("converts a real HEIC photo on this Mac", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "heic-real-"));
		const heic = path.join(root, "photo.heic");
		execFileSync("/usr/bin/sips", [
			"-z",
			"90",
			"160",
			"-s",
			"format",
			"heic",
			path.resolve("public/wallpapers/wallpaper1.jpg"),
			"--out",
			heic,
		]);
		const png = await convertHeicToPng(new Uint8Array(fs.readFileSync(heic)));
		expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
		fs.rmSync(root, { recursive: true });
	});
});
