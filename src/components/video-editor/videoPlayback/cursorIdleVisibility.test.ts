import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint } from "../types";
import { getCursorIdleIntervals, getCursorIdleOpacity } from "./cursorIdleVisibility";

const move = (timeMs: number, cx: number, cy = 0.5): CursorTelemetryPoint => ({ timeMs, cx, cy });

describe("cursor idle visibility", () => {
	it("keeps the cursor visible through pauses shorter than two seconds", () => {
		const samples = [move(0, 0.1), move(500, 0.2), move(2300, 0.2), move(2400, 0.4)];
		expect(getCursorIdleIntervals(samples)).toEqual([]);
		for (const timeMs of [0, 600, 1500, 2300, 2400]) {
			expect(getCursorIdleOpacity(samples, timeMs)).toBe(1);
		}
	});

	it("fades out shortly into a long pause and returns when the cursor moves", () => {
		const samples = [
			move(0, 0.1),
			move(1000, 0.2),
			move(2000, 0.2),
			move(5000, 0.2),
			move(5100, 0.5),
			move(6000, 0.6),
		];
		expect(getCursorIdleIntervals(samples)).toEqual([{ startMs: 1000, endMs: 5000 }]);
		expect(getCursorIdleOpacity(samples, 1400)).toBe(1);
		expect(getCursorIdleOpacity(samples, 1650)).toBeCloseTo(0.5, 5);
		expect(getCursorIdleOpacity(samples, 1800)).toBe(0);
		expect(getCursorIdleOpacity(samples, 4999)).toBe(0);
		expect(getCursorIdleOpacity(samples, 5075)).toBeCloseTo(0.5, 5);
		expect(getCursorIdleOpacity(samples, 5150)).toBe(1);
	});

	it("gives the same answer for a time whatever was asked before (seeking)", () => {
		const samples = [move(0, 0.1), move(1000, 0.2), move(6000, 0.2), move(6100, 0.5)];
		const forward = [500, 1650, 3000, 6050, 6200].map((t) => getCursorIdleOpacity(samples, t));
		const backward = [6200, 6050, 3000, 1650, 500]
			.map((t) => getCursorIdleOpacity(samples, t))
			.reverse();
		expect(backward).toEqual(forward);
	});

	it("wakes on a click even when the cursor has not moved", () => {
		const samples: CursorTelemetryPoint[] = [
			move(0, 0.3),
			move(4000, 0.3),
			{ timeMs: 4000, cx: 0.3, cy: 0.5, interactionType: "click" },
			move(4500, 0.3),
			move(5000, 0.6),
		];
		expect(getCursorIdleOpacity(samples, 3000)).toBe(0);
		expect(getCursorIdleOpacity(samples, 4150)).toBe(1);
		expect(getCursorIdleOpacity(samples, 4900)).toBe(1);
	});

	it("ignores jitter but counts slow drift as movement", () => {
		const jitter = Array.from({ length: 40 }, (_, i) => move(i * 100, 0.5 + (i % 2) * 0.0005));
		expect(getCursorIdleIntervals(jitter)).toHaveLength(1);
		const drift = Array.from({ length: 40 }, (_, i) => move(i * 100, 0.5 + i * 0.0008));
		expect(getCursorIdleIntervals(drift)).toEqual([]);
	});

	it("stays visible while a button is held and after the recording's last movement fades for good", () => {
		const samples: CursorTelemetryPoint[] = [
			move(0, 0.3),
			{ timeMs: 100, cx: 0.3, cy: 0.5, interactionType: "click" },
			move(3000, 0.3),
			{ timeMs: 3100, cx: 0.3, cy: 0.5, interactionType: "mouseup" },
			move(9000, 0.3),
		];
		expect(getCursorIdleOpacity(samples, 2500)).toBe(1);
		expect(getCursorIdleOpacity(samples, 8000)).toBe(0);
		expect(getCursorIdleOpacity(samples, 60_000)).toBe(0);
	});

	it("never hides a recording with no cursor data", () => {
		expect(getCursorIdleOpacity([], 5000)).toBe(1);
		expect(getCursorIdleOpacity([move(0, 0.5)], 5000)).toBe(1);
	});
});
