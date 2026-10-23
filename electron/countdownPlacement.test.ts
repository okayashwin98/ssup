import { describe, expect, it } from "vitest";
import { getCountdownWindowBounds } from "./countdownPlacement";

// The three displays on the Mac this was reported on (Electron points).
const benq = { id: 4, workArea: { x: 0, y: 30, width: 2560, height: 1359 } };
const builtIn = { id: 1, workArea: { x: -1512, y: 1473, width: 1512, height: 949 } };
const lg = { id: 3, workArea: { x: -2560, y: 30, width: 2560, height: 1410 } };
const displays = [benq, builtIn, lg];

describe("countdown placement", () => {
	it("centres on the display of the recorded source", () => {
		expect(getCountdownWindowBounds(displays, benq, "3", 200)).toEqual({
			x: -1380,
			y: 635,
			width: 200,
			height: 200,
		});
		expect(getCountdownWindowBounds(displays, benq, "1", 200)).toEqual({
			x: -856,
			y: 1847,
			width: 200,
			height: 200,
		});
	});

	it("uses the primary display when the source's display is unknown", () => {
		expect(getCountdownWindowBounds(displays, benq, undefined, 200)).toEqual({
			x: 1180,
			y: 609,
			width: 200,
			height: 200,
		});
		expect(getCountdownWindowBounds(displays, benq, "99", 200).x).toBe(1180);
	});
});
