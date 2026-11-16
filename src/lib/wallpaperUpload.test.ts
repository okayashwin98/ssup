import { describe, expect, it } from "vitest";
import {
	MAX_WALLPAPER_EDGE,
	VECTOR_WALLPAPER_EDGE,
	WALLPAPER_IMAGE_ACCEPT,
	wallpaperRasterSize,
	wallpaperUploadKind,
} from "./wallpaperUpload";

describe("wallpaper uploads", () => {
	it("recognises every offered format, by type or by name", () => {
		const kind = (name: string, type = "") => wallpaperUploadKind({ name, type });
		expect(kind("a.jpg", "image/jpeg")).toBe("jpeg");
		expect(kind("a.JPEG")).toBe("jpeg");
		for (const name of ["a.png", "a.webp", "a.avif", "a.gif", "a.bmp"]) {
			expect(kind(name)).toBe("raster");
		}
		expect(kind("a.svg")).toBe("svg");
		// iPhone photos often arrive with no type or a generic one.
		expect(kind("IMG_0001.HEIC")).toBe("heic");
		expect(kind("IMG_0001.heif", "application/octet-stream")).toBe("heic");
		expect(kind("photo", "image/heic")).toBe("heic");
		expect(kind("notes.txt", "text/plain")).toBeNull();
		expect(kind("clip.mp4", "video/mp4")).toBeNull();
		for (const extension of [
			"jpg",
			"png",
			"webp",
			"avif",
			"gif",
			"svg",
			"bmp",
			"heic",
			"heif",
		]) {
			expect(WALLPAPER_IMAGE_ACCEPT).toContain(`.${extension}`);
		}
	});

	it("keeps photo sizes, caps huge ones and draws vectors at 4K", () => {
		expect(wallpaperRasterSize(1920, 1080, false)).toEqual({ width: 1920, height: 1080 });
		expect(wallpaperRasterSize(16384, 8192, false)).toEqual({
			width: MAX_WALLPAPER_EDGE,
			height: MAX_WALLPAPER_EDGE / 2,
		});
		expect(wallpaperRasterSize(100, 50, true)).toEqual({
			width: VECTOR_WALLPAPER_EDGE,
			height: VECTOR_WALLPAPER_EDGE / 2,
		});
		expect(wallpaperRasterSize(0, 0, true).width).toBe(VECTOR_WALLPAPER_EDGE);
		expect(() => wallpaperRasterSize(0, 0, false)).toThrow();
	});
});
