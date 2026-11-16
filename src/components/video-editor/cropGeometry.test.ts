import { describe, expect, it } from "vitest";
import { dragCrop, fitCropRatio, parseCropRatio } from "./cropGeometry";
import type { CropRegion } from "./types";

const full: CropRegion = { x: 0, y: 0, width: 1, height: 1 };
const middle: CropRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
const WIDE = 16 / 9;

function expectCrop(actual: CropRegion, expected: CropRegion) {
	for (const key of ["x", "y", "width", "height"] as const) {
		expect(actual[key]).toBeCloseTo(expected[key], 6);
	}
}

/** The crop's shape in source pixels. */
const pixelRatio = (crop: CropRegion, sourceRatio: number) =>
	(crop.width / crop.height) * sourceRatio;

describe("dragCrop", () => {
	it("moves the crop without resizing and stops at the frame", () => {
		expectCrop(dragCrop(middle, "move", 0.1, -0.1, null, WIDE), {
			...middle,
			x: 0.35,
			y: 0.15,
		});
		expectCrop(dragCrop(middle, "move", 5, 5, null, WIDE), { ...middle, x: 0.5, y: 0.5 });
		expectCrop(dragCrop(middle, "move", -5, -5, null, WIDE), { ...middle, x: 0, y: 0 });
	});

	it("drags an edge and leaves the other three where they were", () => {
		expectCrop(dragCrop(middle, "e", 0.1, 0.3, null, WIDE), { ...middle, width: 0.6 });
		expectCrop(dragCrop(middle, "n", 0.3, 0.1, null, WIDE), {
			...middle,
			y: 0.35,
			height: 0.4,
		});
	});

	it("drags a corner about the opposite corner", () => {
		expectCrop(dragCrop(middle, "nw", -0.1, -0.2, null, WIDE), {
			x: 0.15,
			y: 0.05,
			width: 0.6,
			height: 0.7,
		});
		expectCrop(dragCrop(middle, "se", 5, 5, null, WIDE), {
			x: 0.25,
			y: 0.25,
			width: 0.75,
			height: 0.75,
		});
	});

	it("never shrinks below a tenth of the frame", () => {
		expectCrop(dragCrop(middle, "e", -5, 0, null, WIDE), { ...middle, width: 0.1 });
		expectCrop(dragCrop(middle, "s", 0, -5, null, WIDE), { ...middle, height: 0.1 });
	});

	it("leaves a crop from an older project that is already smaller than that", () => {
		const tiny: CropRegion = { x: 0.4, y: 0.4, width: 0.05, height: 0.05 };
		expectCrop(dragCrop(tiny, "e", -5, 0, null, WIDE), tiny);
		expectCrop(dragCrop(tiny, "e", 0.2, 0, null, WIDE), { ...tiny, width: 0.25 });
	});

	it("keeps a square in source pixels while Shift is held", () => {
		const corner = dragCrop(middle, "se", 0.1, 0.02, 1, WIDE);
		expect(pixelRatio(corner, WIDE)).toBeCloseTo(1, 6);
		expect(corner.x).toBeCloseTo(0.25, 6);
		expect(corner.y).toBeCloseTo(0.25, 6);
		// An edge drag grows about the middle of the other axis.
		const edge = dragCrop(middle, "e", 0, 0, 1, WIDE);
		expect(pixelRatio(edge, WIDE)).toBeCloseTo(1, 6);
		expect(edge.y + edge.height / 2).toBeCloseTo(0.5, 6);
	});

	it("keeps a locked shape inside the frame", () => {
		const locked = dragCrop(middle, "se", 5, 5, 4 / 3, WIDE);
		expect(pixelRatio(locked, WIDE)).toBeCloseTo(4 / 3, 6);
		expect(locked.x + locked.width).toBeLessThanOrEqual(1 + 1e-9);
		expect(locked.y + locked.height).toBeLessThanOrEqual(1 + 1e-9);
	});
});

describe("fitCropRatio", () => {
	it("fits the shape inside the crop about its centre", () => {
		const square = fitCropRatio(full, 1, WIDE);
		expect(pixelRatio(square, WIDE)).toBeCloseTo(1, 6);
		expectCrop(square, { x: (1 - 9 / 16) / 2, y: 0, width: 9 / 16, height: 1 });
		const tall = fitCropRatio(middle, 9 / 16, WIDE);
		expect(pixelRatio(tall, WIDE)).toBeCloseTo(9 / 16, 6);
		expect(tall.x + tall.width / 2).toBeCloseTo(0.5, 6);
		expect(tall.height).toBeCloseTo(0.5, 6);
	});

	it("leaves a crop that already has the shape", () => {
		expectCrop(fitCropRatio(full, WIDE, WIDE), full);
	});
});

describe("parseCropRatio", () => {
	it("accepts shapes from 1:20 to 20:1", () => {
		expect(parseCropRatio("16", "9")).toBeCloseTo(16 / 9);
		expect(parseCropRatio("2.35", "1")).toBeCloseTo(2.35);
		expect(parseCropRatio("1", "20")).toBeCloseTo(0.05);
		expect(parseCropRatio("20", "1")).toBe(20);
	});

	it("rejects anything else", () => {
		for (const [width, height] of [
			["21", "1"],
			["1", "21"],
			["0", "9"],
			["16", "0"],
			["", "9"],
			["-16", "9"],
			["abc", "9"],
			["1e2", "9"],
		]) {
			expect(parseCropRatio(width, height)).toBeNull();
		}
	});
});
