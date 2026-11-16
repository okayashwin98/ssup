import { describe, expect, it } from "vitest";
import { planClipMerge, resolveSelectedClipIds, selectClipRange } from "./clipMerge";
import { planClipSplit } from "./clipSplit";
import {
	createEditorHistoryStack,
	type EditorHistorySnapshot,
	recordEditorHistorySnapshot,
	undoEditorHistoryStack,
} from "./editorHistory";
import type { ClipRegion } from "./types";

/** One recording cut into consecutive clips at the given timeline positions. */
function cut(clip: ClipRegion, ...splits: number[]): ClipRegion[] {
	let next = 1;
	let clips = [clip];
	for (const splitMs of splits) {
		const plan = planClipSplit({
			clipRegions: clips,
			splitMs,
			createId: () => `clip-${next++}`,
		});
		if (!plan) throw new Error(`no clip at ${splitMs}`);
		clips = clips.flatMap((item) =>
			item.id === plan.targetId ? [plan.left, plan.right] : [item],
		);
	}
	return clips;
}

const ids = (clips: ClipRegion[]) => clips.map((clip) => clip.id);
const whole: ClipRegion = { id: "whole", startMs: 0, endMs: 9_000, speed: 1 };

describe("selectClipRange", () => {
	const clips = cut(whole, 3_000, 6_000);
	const [a, b, c] = ids(clips);

	it("takes every clip between the two ends, in either direction", () => {
		expect(selectClipRange(clips, a, c)).toEqual([a, b, c]);
		expect(selectClipRange(clips, c, a)).toEqual([a, b, c]);
		expect(selectClipRange(clips, b, b)).toEqual([b]);
	});

	it("falls back to the clicked clip when the start is gone", () => {
		expect(selectClipRange(clips, "missing", b)).toEqual([b]);
		expect(selectClipRange(clips, a, "missing")).toEqual([]);
	});

	it("drops a range once the clips change or the selected clip leaves it", () => {
		const range = { anchorId: a, ids: [a, b], clips };
		expect(resolveSelectedClipIds(clips, b, range)).toEqual([a, b]);
		expect(resolveSelectedClipIds(clips, c, range)).toEqual([c]);
		expect(resolveSelectedClipIds([...clips], b, range)).toEqual([b]);
		expect(resolveSelectedClipIds(clips, null, range)).toEqual([]);
		expect(resolveSelectedClipIds(clips, b, null)).toEqual([b]);
	});
});

describe("planClipMerge", () => {
	it("joins two halves of a cut back into the clip they came from", () => {
		const clips = cut(whole, 4_000);
		const merged = planClipMerge(clips, ids(clips));
		expect(merged).toEqual([{ ...whole, id: clips[0].id, sourceStartMs: 0 }]);
	});

	it("joins a three-clip range and leaves the clips around it alone", () => {
		const clips = cut(whole, 2_000, 4_000, 6_000, 8_000);
		const merged = planClipMerge(clips, ids(clips).slice(1, 4));
		expect(merged).toMatchObject([
			{ id: clips[0].id, startMs: 0, endMs: 2_000 },
			{ id: clips[1].id, startMs: 2_000, endMs: 8_000, sourceStartMs: 2_000 },
			{ id: clips[4].id, startMs: 8_000, endMs: 9_000 },
		]);
		expect(merged).toHaveLength(3);
	});

	it("joins sped-up clips when the footage runs on", () => {
		const clips = cut({ ...whole, endMs: 4_500, speed: 2 }, 1_500);
		expect(clips[1].sourceStartMs).toBe(3_000);
		expect(planClipMerge(clips, ids(clips))).toMatchObject([
			{ startMs: 0, endMs: 4_500, sourceStartMs: 0, speed: 2 },
		]);
	});

	it("needs at least two known clips", () => {
		const clips = cut(whole, 4_000);
		expect(planClipMerge(clips, [clips[0].id])).toBeNull();
		expect(planClipMerge(clips, [clips[0].id, "missing"])).toBeNull();
	});

	it("refuses footage that is not continuous", () => {
		const [a, b, c] = cut(whole, 3_000, 6_000);
		// The middle was deleted and the rest closed up: neighbours, but the footage jumps.
		const closedUp = [a, { ...c, startMs: 3_000, endMs: 6_000, sourceStartMs: 6_000 }];
		expect(planClipMerge(closedUp, ids(closedUp))).toBeNull();
		// A gap on the timeline.
		expect(planClipMerge([a, c], [a.id, c.id])).toBeNull();
		// Selected clips with another one between them.
		expect(planClipMerge([a, b, c], [a.id, c.id])).toBeNull();
		// Clips from different recordings in one project.
		const other = [a, { ...b, sourceMinMs: 3_000, sourceMaxMs: 6_000 }];
		expect(planClipMerge(other, ids(other))).toBeNull();
	});

	it("refuses mismatched speed", () => {
		const [a, b] = cut(whole, 4_000);
		const clips = [a, { ...b, speed: 2 }];
		expect(planClipMerge(clips, ids(clips))).toBeNull();
	});

	it("refuses mismatched audio", () => {
		const [a, b] = cut(whole, 4_000);
		expect(planClipMerge([a, { ...b, muted: true }], [a.id, b.id])).toBeNull();
		expect(planClipMerge([a, { ...b, showSourceAudio: true }], [a.id, b.id])).toBeNull();
		const levels = (id: string) => ({ mic: { volume: id === b.id ? 0.5 : 1 } });
		expect(planClipMerge([a, b], [a.id, b.id], levels)).toBeNull();
		const normalize = (id: string) => ({ mic: { volume: 1, normalize: id === a.id } });
		expect(planClipMerge([a, b], [a.id, b.id], normalize)).toBeNull();
		// Levels spelled out on one clip and left at the default on the other are the same.
		const spelledOut = (id: string) => (id === a.id ? { mic: { volume: 1 } } : {});
		expect(planClipMerge([a, b], [a.id, b.id], spelledOut)).not.toBeNull();
	});

	it("refuses mismatched Filter noise or Remove fillers", () => {
		const [a, b] = cut(whole, 4_000);
		const both = [a.id, b.id];
		expect(planClipMerge([{ ...a, noiseFilter: 1 }, b], both)).toBeNull();
		expect(
			planClipMerge(
				[
					{ ...a, noiseFilter: 1 },
					{ ...b, noiseFilter: 0.5 },
				],
				both,
			),
		).toBeNull();
		expect(planClipMerge([a, { ...b, removeFillers: true }], both)).toBeNull();
		expect(
			planClipMerge(
				[
					{ ...a, noiseFilter: 1 },
					{ ...b, noiseFilter: 1, removeFillers: true },
				],
				both,
			),
		).toBeNull();
	});

	it("keeps one cleaned voice when the cleanup matches", () => {
		const cleanedAudio = { sourcePath: "/rec.mic.wav", path: "/rec.mic.clean.wav" };
		const clips = cut({ ...whole, noiseFilter: 1, removeFillers: true, cleanedAudio }, 4_000);
		const merged = planClipMerge(clips, ids(clips));
		expect(merged).toHaveLength(1);
		expect(merged?.[0]).toMatchObject({ noiseFilter: 1, removeFillers: true, cleanedAudio });
		// Off, spelled as 0 or false on one clip and absent on the other, is the same setting.
		const [a, b] = cut(whole, 4_000);
		const off = [{ ...a, noiseFilter: 0, removeFillers: false }, b];
		expect(planClipMerge(off, ids(off))).toMatchObject([{ startMs: 0, endMs: 9_000 }]);
		// Two different cleaned copies never end up behind one clip.
		const twoCopies = [
			clips[0],
			{ ...clips[1], cleanedAudio: { ...cleanedAudio, path: "/b.wav" } },
		];
		expect(planClipMerge(twoCopies, ids(twoCopies))).toBeNull();
	});

	it("is undone in one step through the editor history", () => {
		const clips = cut(whole, 3_000, 6_000);
		const snapshot = (
			clipRegions: ClipRegion[],
			selectedClipId: string,
		): EditorHistorySnapshot => ({
			zoomRegions: [],
			clipRegions,
			speedRegions: [],
			annotationRegions: [],
			audioRegions: [],
			autoCaptions: [],
			selectedZoomId: null,
			selectedClipId,
			selectedAnnotationId: null,
			selectedAudioId: null,
		});
		const stack = createEditorHistoryStack();
		const before = snapshot(clips, clips[2].id);
		recordEditorHistorySnapshot(stack, before);
		const merged = planClipMerge(clips, ids(clips));
		if (!merged) throw new Error("merge refused");
		const after = snapshot(merged, merged[0].id);
		expect(recordEditorHistorySnapshot(stack, after)).toBe("recorded");
		expect(undoEditorHistoryStack(stack, after)).toEqual(before);
	});
});
