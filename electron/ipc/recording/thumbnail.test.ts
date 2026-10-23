import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-thumbs-"));
const recordings = await fs.realpath(path.join(root));
vi.mock("electron", () => ({ app: { getPath: () => root } }));
vi.mock("../ffmpeg/binary", () => ({ getFfmpegBinaryPath: () => ffmpeg }));
vi.mock("../utils", () => ({ getRecordingsDir: async () => recordings }));
vi.mock("../project/manager", () => ({
	resolveApprovedLocalMediaPath: async (file: string) => file,
}));
const { getRecordingThumbnail } = await import("./thumbnail");

const fixture = path.resolve("tests/ui/fixtures/preview.mp4");

describe("recording thumbnails", () => {
	beforeAll(async () => {
		await fs.mkdir(path.join(recordings, "My project"), { recursive: true });
		await fs.mkdir(path.join(recordings, "Projects"), { recursive: true });
		await fs.copyFile(fixture, path.join(recordings, "recording-1.mp4"));
		await fs.copyFile(fixture, path.join(recordings, "My project", "recording-2.mp4"));
		await fs.copyFile(fixture, path.join(recordings, "Projects", "recording-3.mp4"));
	});
	afterAll(() => fs.rm(root, { recursive: true, force: true }));

	it("makes previews for loose recordings and ones filed in a project folder", async () => {
		expect(await getRecordingThumbnail(path.join(recordings, "recording-1.mp4"))).toMatch(
			/^data:image\/jpeg;base64,/,
		);
		expect(
			await getRecordingThumbnail(path.join(recordings, "My project", "recording-2.mp4")),
		).toMatch(/^data:image\/jpeg;base64,/);
	}, 30000);

	it("refuses the Projects folder and anything outside the library", async () => {
		await expect(
			getRecordingThumbnail(path.join(recordings, "Projects", "recording-3.mp4")),
		).rejects.toThrow(/outside/);
		await expect(getRecordingThumbnail(fixture)).rejects.toThrow(/outside/);
	});
});
