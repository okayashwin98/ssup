import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_EDITOR_PREFERENCES,
	normalizeEditorPreferences,
} from "@/components/video-editor/editorPreferences";
import {
	createCustomGradient,
	isCustomGradientWallpaper,
	normalizeCustomColors,
	normalizeCustomGradients,
	PRESET_GRADIENTS,
	parseCustomGradient,
} from "./backgroundGradients";
import { createCssGradientBackground } from "./exporter/cssGradientBackground";

describe("custom background gradients", () => {
	it("writes and reads back the builder's gradient form", () => {
		const css = createCustomGradient({ angle: -45, colors: ["#AA0000", "#00bb00", "#0000cc"] });
		expect(css).toBe("linear-gradient(315deg, #aa0000 0%, #00bb00 50%, #0000cc 100%)");
		expect(parseCustomGradient(css)).toEqual({
			angle: 315,
			colors: ["#aa0000", "#00bb00", "#0000cc"],
		});
		expect(() => createCustomGradient({ angle: 0, colors: ["#000000"] })).toThrow();
	});

	it("never treats a preset as custom, so saved projects with presets export as before", () => {
		for (const preset of PRESET_GRADIENTS) {
			expect(isCustomGradientWallpaper(preset)).toBe(false);
		}
		expect(isCustomGradientWallpaper("linear-gradient(10deg, #000000 0%, #ffffff 100%)")).toBe(
			true,
		);
		expect(isCustomGradientWallpaper("#123456")).toBe(false);
		expect(isCustomGradientWallpaper("/wallpapers/wallpaper1.jpg")).toBe(false);
	});

	it("keeps only valid, unique saved colours and gradients", () => {
		expect(normalizeCustomColors(["#ABCDEF", "#abcdef", "red", 3, "#12345"])).toEqual([
			"#abcdef",
		]);
		expect(
			normalizeCustomGradients([
				"linear-gradient(90deg, #000000 0%, #ffffff 100%)",
				"linear-gradient(90deg, #000000 0%, #ffffff 100%)",
				"linear-gradient(90deg, red, blue)",
				PRESET_GRADIENTS[1],
			]),
		).toEqual(["linear-gradient(90deg, #000000 0%, #ffffff 100%)"]);
		expect(normalizeCustomGradients("nope")).toEqual([]);
	});

	it("loads older preferences without saved colours or gradients unchanged", () => {
		const older = { wallpaper: "#ff0000", customWallpapers: ["data:image/jpeg;base64,AA"] };
		const loaded = normalizeEditorPreferences(older);
		expect(loaded.customColors).toEqual([]);
		expect(loaded.customGradients).toEqual([]);
		expect(loaded.wallpaper).toBe("#ff0000");
		expect(loaded.customWallpapers).toEqual(older.customWallpapers);
		expect(DEFAULT_EDITOR_PREFERENCES.customColors).toEqual([]);
	});

	it("draws the builder's angle the way CSS does", () => {
		const gradient = { addColorStop: vi.fn() };
		const ctx = {
			createLinearGradient: vi.fn(() => gradient),
			createRadialGradient: vi.fn(() => gradient),
		} as unknown as CanvasRenderingContext2D;
		createCssGradientBackground(
			ctx,
			createCustomGradient({ angle: 90, colors: ["#000000", "#ffffff"] }),
			200,
			100,
		);
		const [x0, y0, x1, y1] = vi.mocked(ctx.createLinearGradient).mock.calls[0];
		[0, 50, 200, 50].forEach((value, index) =>
			expect([x0, y0, x1, y1][index]).toBeCloseTo(value),
		);
		expect(gradient.addColorStop.mock.calls).toEqual([
			[0, "#000000"],
			[1, "#ffffff"],
		]);
	});
});
