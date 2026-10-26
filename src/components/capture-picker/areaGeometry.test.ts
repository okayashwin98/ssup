import { describe, expect, it } from "vitest";
import { frontmostAt, moveAreaRect, normalizeAreaRect, resizeAreaRect } from "./areaGeometry";

const bounds = { width: 1000, height: 800 };

describe("area geometry", () => {
	it("normalizes drags that go up or left", () => {
		expect(normalizeAreaRect({ x: 300, y: 200, width: -100, height: -50 }, bounds)).toEqual({
			x: 200,
			y: 150,
			width: 100,
			height: 50,
		});
	});

	it("clamps rectangles to the overlay", () => {
		expect(normalizeAreaRect({ x: 900, y: 700, width: 300, height: 300 }, bounds)).toEqual({
			x: 900,
			y: 700,
			width: 100,
			height: 100,
		});
		expect(
			moveAreaRect({ x: 100, y: 100, width: 200, height: 200 }, 2000, -500, bounds),
		).toEqual({
			x: 800,
			y: 0,
			width: 200,
			height: 200,
		});
	});

	it("resizes from an edge or corner and flips past the opposite edge", () => {
		const rect = { x: 100, y: 100, width: 200, height: 100 };
		expect(resizeAreaRect(rect, "se", 50, 20, bounds)).toEqual({
			x: 100,
			y: 100,
			width: 250,
			height: 120,
		});
		expect(resizeAreaRect(rect, "w", 300, 0, bounds)).toEqual({
			x: 300,
			y: 100,
			width: 100,
			height: 100,
		});
		expect(resizeAreaRect(rect, "n", 0, -150, bounds)).toEqual({
			x: 100,
			y: 0,
			width: 200,
			height: 200,
		});
	});
});

describe("ratio-locked resizing", () => {
	const bounds = { width: 1440, height: 1000 };
	const rect = { x: 100, y: 100, width: 320, height: 180 };
	const ratio = 16 / 9;

	it("keeps the shape from a corner, following the side pulled further", () => {
		expect(resizeAreaRect(rect, "se", 160, 10, bounds, ratio)).toEqual({
			x: 100,
			y: 100,
			width: 480,
			height: 270,
		});
		expect(
			resizeAreaRect(
				{ x: 600, y: 400, width: 320, height: 180 },
				"nw",
				-10,
				-90,
				bounds,
				ratio,
			),
		).toEqual({ x: 440, y: 310, width: 480, height: 270 });
	});

	it("grows evenly about the centre line from an edge", () => {
		expect(resizeAreaRect(rect, "e", 160, 0, bounds, ratio)).toEqual({
			x: 100,
			y: 55,
			width: 480,
			height: 270,
		});
		expect(resizeAreaRect(rect, "n", 0, -90, bounds, ratio)).toEqual({
			x: 20,
			y: 10,
			width: 480,
			height: 270,
		});
	});

	it("slides along the screen edge from an edge handle instead of shrinking", () => {
		// 160 × 90 hugging the top edge; dragging its right edge 160 px.
		const grown = resizeAreaRect(
			{ x: 100, y: 0, width: 160, height: 90 },
			"e",
			160,
			0,
			bounds,
			ratio,
		);
		expect(grown).toEqual({ x: 100, y: 0, width: 320, height: 180 });
	});

	it("stops at the screen's edge without losing the shape", () => {
		const grown = resizeAreaRect(rect, "se", 5000, 5000, bounds, ratio);
		expect(grown.x + grown.width).toBeLessThanOrEqual(bounds.width);
		expect(grown.y + grown.height).toBeLessThanOrEqual(bounds.height);
		expect(Math.abs(grown.width / grown.height - ratio)).toBeLessThan(0.01);
	});
});

describe("frontmostAt", () => {
	const back = { id: "back", rect: { x: 0, y: 0, width: 800, height: 600 } };
	const front = { id: "front", rect: { x: 100, y: 100, width: 200, height: 200 } };

	it("finds the frontmost window under a point", () => {
		expect(frontmostAt([front, back], 150, 150)?.id).toBe("front");
		expect(frontmostAt([front, back], 500, 500)?.id).toBe("back");
	});

	it("finds nothing over the desktop", () => {
		expect(frontmostAt([front, back], 900, 700)).toBeNull();
	});
});
