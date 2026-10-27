import { describe, expect, it } from "vitest";
import {
	isTimelineLayerOn,
	normalizeHiddenTimelineLayers,
	toggleTimelineLayer,
	visibleTrackRegions,
	withHiddenSourceTracksSilent,
} from "./timelineLayers";

describe("timeline rows turned off", () => {
	it("toggles a row off and back on", () => {
		const off = toggleTimelineLayer([], "video");
		expect(isTimelineLayerOn(off, "video")).toBe(false);
		expect(isTimelineLayerOn(toggleTimelineLayer(off, "video"), "video")).toBe(true);
	});

	it("leaves out annotations and added audio only on rows that are off", () => {
		const regions = [{ id: "a", trackIndex: 0 }, { id: "b", trackIndex: 1 }, { id: "c" }];
		expect(
			visibleTrackRegions(regions, ["annotation:1"], "annotation").map((r) => r.id),
		).toEqual(["a", "c"]);
		// A region without a row index is on row 0.
		expect(visibleTrackRegions(regions, ["audio:0"], "audio").map((r) => r.id)).toEqual(["b"]);
		expect(visibleTrackRegions(regions, ["audio:0"], "annotation")).toBe(regions);
	});

	it("silences source tracks that are off and keeps the rest", () => {
		const settings = {
			system: { volume: 0.8, normalize: true },
			mic: { volume: 1, normalize: false },
		};
		expect(withHiddenSourceTracksSilent(settings, ["source:mic"])).toEqual({
			system: { volume: 0.8, normalize: true },
			mic: { volume: 0, normalize: false },
		});
		expect(withHiddenSourceTracksSilent(settings, ["video"])).toBe(settings);
	});

	it("keeps only known row ids from a saved project", () => {
		expect(
			normalizeHiddenTimelineLayers(["video", "source:mic", "audio:2", "bogus", 4, "video"]),
		).toEqual(["video", "source:mic", "audio:2"]);
		expect(normalizeHiddenTimelineLayers(undefined)).toEqual([]);
	});
});
