import { describe, expect, it } from "vitest";
import { calculateMp4SourceDimensions } from "@/components/video-editor/exportDimensions";
import {
	ASPECT_RATIOS,
	customSizeToAspectRatio,
	getAspectRatioFrameSize,
	getAspectRatioShortLabel,
	getAspectRatioValue,
	getCustomSize,
	isCustomAspectRatio,
} from "./aspectRatioUtils";

describe("aspect ratio picker values", () => {
	it("keeps every ratio saved by earlier versions", () => {
		expect(ASPECT_RATIOS).toEqual([
			"native",
			"16:9",
			"9:16",
			"1:1",
			"4:3",
			"4:5",
			"16:10",
			"10:16",
		]);
		expect(getAspectRatioValue("16:10")).toBeCloseTo(1.6);
		expect(getAspectRatioValue("10:16")).toBeCloseTo(0.625);
	});

	it("resolves the added ratios and social presets as plain ratios", () => {
		for (const [ratio, value] of [
			["3:2", 1.5],
			["5:4", 1.25],
			["3:4", 0.75],
			["2:3", 2 / 3],
			["3:1", 3],
		] as const) {
			expect(isCustomAspectRatio(ratio)).toBe(true);
			expect(getAspectRatioValue(ratio)).toBeCloseTo(value);
			expect(getCustomSize(ratio)).toBeNull();
			expect(getAspectRatioShortLabel(ratio)).toBe(ratio);
		}
	});

	it("accepts a typed size only as whole pixels from 128 to 7680", () => {
		expect(customSizeToAspectRatio("1280", "720")).toBe("1280:720");
		expect(customSizeToAspectRatio("128", "7680")).toBe("128:7680");
		for (const [width, height] of [
			["127", "720"],
			["1280", "7681"],
			["", "720"],
			["12.5", "720"],
			["-300", "720"],
			["abc", "720"],
			["0", "0"],
		]) {
			expect(customSizeToAspectRatio(width, height)).toBeNull();
		}
	});

	it("labels and sizes a typed size", () => {
		expect(getAspectRatioShortLabel("native")).toBe("Native");
		expect(getAspectRatioShortLabel("1280:720")).toBe("1280 × 720");
		expect(getAspectRatioFrameSize("1280:720", 1920, 1080)).toEqual({
			width: 1280,
			height: 720,
		});
		expect(getAspectRatioFrameSize("native", 1728, 1117)).toEqual({
			width: 1728,
			height: 1117,
		});
		expect(getAspectRatioFrameSize("9:16", 1920, 1080)).toEqual({ width: 1080, height: 1920 });
		expect(getAspectRatioFrameSize("1:1", 1920, 1080)).toEqual({ width: 1920, height: 1920 });
	});

	it("feeds a typed size to export as its ratio", () => {
		const typed = customSizeToAspectRatio("1000", "1000");
		expect(typed).not.toBeNull();
		expect(calculateMp4SourceDimensions(1920, 1080, typed ?? "native")).toEqual(
			calculateMp4SourceDimensions(1920, 1080, "1:1"),
		);
		expect(calculateMp4SourceDimensions(1920, 1080, "3:1")).toEqual({
			width: 1920,
			height: 640,
		});
	});
});
