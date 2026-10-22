import { describe, expect, it } from "vitest";
import { SmoothedCursorState } from "./cursorRenderer";

const neutralTuning = { stiffnessMultiplier: 1, dampingMultiplier: 1, massMultiplier: 1 };

describe("cursor smoothing Off", () => {
	it("draws the cursor exactly at the recorded position", () => {
		const state = new SmoothedCursorState({
			smoothingFactor: 0,
			trailLength: 0,
			springTuning: neutralTuning,
		});
		state.update(0.1, 0.1, 0);
		state.update(0.9, 0.7, 16);
		expect([state.x, state.y]).toEqual([0.9, 0.7]);
	});

	it("trails the recorded position when smoothing is on", () => {
		const state = new SmoothedCursorState({
			smoothingFactor: 0.67,
			trailLength: 0,
			springTuning: neutralTuning,
		});
		state.update(0.1, 0.1, 0);
		state.update(0.9, 0.7, 16);
		expect(state.x).toBeLessThan(0.9);
	});
});
