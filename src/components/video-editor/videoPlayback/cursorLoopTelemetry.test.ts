import { describe, expect, it } from "vitest";
import { buildLoopedCursorTelemetry } from "./cursorLoopTelemetry";
import { interpolateCursorPosition } from "./cursorPosition";

const samples = Array.from({ length: 101 }, (_, index) => ({
	timeMs: index * 100,
	cx: 0.1 + (index % 20) * 0.04,
	cy: 0.2 + (index % 10) * 0.05,
}));

describe("buildLoopedCursorTelemetry", () => {
	it("keeps recorded timing until the final return to the start", () => {
		const looped = buildLoopedCursorTelemetry(samples, 10_000);
		for (const timeMs of [0, 1_250, 4_000, 7_730, 9_300]) {
			expect(interpolateCursorPosition(looped, timeMs)).toEqual(
				interpolateCursorPosition(samples, timeMs),
			);
		}
	});

	it("ends at the starting position so the video loops", () => {
		const looped = buildLoopedCursorTelemetry(samples, 10_000);
		expect(interpolateCursorPosition(looped, 10_000)).toEqual({
			cx: samples[0].cx,
			cy: samples[0].cy,
		});
	});
});
