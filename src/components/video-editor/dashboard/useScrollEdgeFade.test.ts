import { describe, expect, it } from "vitest";
import { scrollEdgeFadeOpacity } from "./useScrollEdgeFade";

describe("scrollEdgeFadeOpacity", () => {
	it("shows no fade when everything fits", () => {
		expect(
			scrollEdgeFadeOpacity({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 }),
		).toEqual({ top: 0, bottom: 0 });
	});

	it("fades only the bottom at the very top", () => {
		expect(
			scrollEdgeFadeOpacity({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 }),
		).toEqual({ top: 0, bottom: 1 });
	});

	it("fades both edges in the middle", () => {
		expect(
			scrollEdgeFadeOpacity({ scrollTop: 700, scrollHeight: 2000, clientHeight: 500 }),
		).toEqual({ top: 1, bottom: 1 });
	});

	it("fades only the top at the very bottom", () => {
		expect(
			scrollEdgeFadeOpacity({ scrollTop: 1500, scrollHeight: 2000, clientHeight: 500 }),
		).toEqual({ top: 1, bottom: 0 });
	});

	it("comes in gradually over the first pixels of scrolling", () => {
		expect(
			scrollEdgeFadeOpacity({ scrollTop: 12, scrollHeight: 2000, clientHeight: 500 }).top,
		).toBe(0.5);
	});
});
