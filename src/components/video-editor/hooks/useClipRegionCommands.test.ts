import { describe, expect, it, vi } from "vitest";
import { type ClipRangeSelection, resolveSelectedClipIds } from "../clipMerge";
import type { ClipRegion } from "../types";
import { useClipRegionCommands } from "./useClipRegionCommands";

vi.mock("react", async (importOriginal) => ({
	...(await importOriginal<typeof import("react")>()),
	useCallback: (callback: unknown) => callback,
}));

describe("clip split selection", () => {
	it("selects the middle section after two cuts so Delete removes it", () => {
		let clips: ClipRegion[] = [{ id: "original", startMs: 0, endMs: 3_000, speed: 1 }];
		let selectedClipId: string | null = null;
		const nextClipIdRef = { current: 1 };
		const setClipRegions = (
			value: ClipRegion[] | ((current: ClipRegion[]) => ClipRegion[]),
		) => {
			clips = typeof value === "function" ? value(clips) : value;
		};
		const setSelectedClipId = (value: string | null) => {
			selectedClipId = value;
		};
		const commands = () =>
			useClipRegionCommands({
				clipRegions: clips,
				selectedClipId,
				sourceDurationMs: 3_000,
				nextClipIdRef,
				setClipRegions,
				setSelectedClipId,
				selectedClipIds: selectedClipId ? [selectedClipId] : [],
				clipRangeSelection: null,
				setClipRangeSelection: () => {},
				getSourceAudioTrackSettingsForClip: () => ({}),
				setZoomRegions: () => {},
				setAnnotationRegions: () => {},
				setAudioRegions: () => {},
				setSelectedZoomId: () => {},
				setSelectedAnnotationId: () => {},
				setSelectedAudioId: () => {},
				setSelectedCaptionId: () => {},
				setActiveEffectSection: () => {},
				t: (key) => key,
			});

		commands().handleClipSplit(1_000);
		expect(selectedClipId).toBe(clips[0].id);
		selectedClipId = null;
		commands().handleClipSplit(2_000);
		expect(selectedClipId).toBe(clips[1].id);
		commands().handleClipDelete(selectedClipId!);
		expect(clips).toMatchObject([
			{ startMs: 0, endMs: 1_000 },
			{ startMs: 1_000, endMs: 2_000, sourceStartMs: 2_000 },
		]);
	});
});

describe("clip range selection and merge", () => {
	it("shift-click selects a range, merge joins it, and a plain click selects one clip", () => {
		let clips: ClipRegion[] = [
			{ id: "a", startMs: 0, endMs: 1_000, speed: 1 },
			{ id: "b", startMs: 1_000, endMs: 2_000, speed: 1, sourceStartMs: 1_000 },
			{ id: "c", startMs: 2_000, endMs: 3_000, speed: 1, sourceStartMs: 2_000 },
		];
		let selectedClipId: string | null = null;
		let range: ClipRangeSelection | null = null;
		const commands = () =>
			useClipRegionCommands({
				clipRegions: clips,
				selectedClipId,
				sourceDurationMs: 3_000,
				nextClipIdRef: { current: 1 },
				setClipRegions: (value) => {
					clips = typeof value === "function" ? value(clips) : value;
				},
				setSelectedClipId: (value) => {
					selectedClipId = typeof value === "function" ? value(selectedClipId) : value;
				},
				selectedClipIds: resolveSelectedClipIds(clips, selectedClipId, range),
				clipRangeSelection: range,
				setClipRangeSelection: (value) => {
					range = typeof value === "function" ? value(range) : value;
				},
				getSourceAudioTrackSettingsForClip: () => ({}),
				setZoomRegions: () => {},
				setAnnotationRegions: () => {},
				setAudioRegions: () => {},
				setSelectedZoomId: () => {},
				setSelectedAnnotationId: () => {},
				setSelectedAudioId: () => {},
				setSelectedCaptionId: () => {},
				setActiveEffectSection: () => {},
				t: (key) => key,
			});

		commands().handleSelectClip("a");
		expect(commands().selectedClipIds).toEqual(["a"]);
		expect(commands().canMergeSelectedClips).toBe(false);
		commands().handleSelectClip("c", true);
		expect(commands().selectedClipIds).toEqual(["a", "b", "c"]);
		// Extending again keeps the clip the selection started from.
		commands().handleSelectClip("b", true);
		expect(commands().selectedClipIds).toEqual(["a", "b"]);
		commands().handleSelectClip("b");
		expect(commands().selectedClipIds).toEqual(["b"]);
		commands().handleSelectClip("c", true);
		expect(commands().selectedClipIds).toEqual(["b", "c"]);
		expect(commands().canMergeSelectedClips).toBe(true);
		commands().handleMergeSelectedClips();
		expect(clips).toEqual([
			{ id: "a", startMs: 0, endMs: 1_000, speed: 1 },
			{ id: "b", startMs: 1_000, endMs: 3_000, speed: 1, sourceStartMs: 1_000 },
		]);
		expect(selectedClipId).toBe("b");
		expect(commands().selectedClipIds).toEqual(["b"]);
	});
});
