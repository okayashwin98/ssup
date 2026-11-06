import { describe, expect, it, vi } from "vitest";
import type { ClipRegion } from "@/components/video-editor/types";
import { OfflineAudioProcessor } from "./offlineAudioProcessor";

const buffers = new Map<string, AudioBuffer>();
const bufferFor = (url: string) => {
	if (!buffers.has(url)) buffers.set(url, { duration: 12, numberOfChannels: 1, url } as never);
	return buffers.get(url) as AudioBuffer;
};
class TestAudioProcessor extends OfflineAudioProcessor {
	prepare = this.prepareOfflineRender.bind(this);
	protected decodeAudioFromUrl = vi.fn(async (url: string) => bufferFor(url));
	protected getMediaDurationSec = vi.fn(async () => 12);
}

const clips: ClipRegion[] = [
	{ id: "a", startMs: 0, endMs: 3000, sourceStartMs: 0, speed: 1 },
	{ id: "b", startMs: 3000, endMs: 6000, sourceStartMs: 3000, speed: 1 },
	{ id: "c", startMs: 6000, endMs: 9000, sourceStartMs: 6000, speed: 1, muted: true },
];
const ranges = (...pairs: Array<[number, number]>) =>
	pairs.map(([startSec, endSec]) => ({ startSec, endSec }));

describe("noise-filtered clips in export", () => {
	it("swap the microphone file for its cleaned copy on filtered clips only", async () => {
		const mic = "/rec/recording-1.mic.m4a";
		const cleaned = "/rec/recording-1.mic.clean100.m4a";
		const prepared = await new TestAudioProcessor().prepare(
			"/rec/recording-1.mp4",
			[],
			[],
			[],
			["/rec/recording-1.system.m4a", mic],
			undefined,
			undefined,
			clips.map((clip) =>
				clip.id === "b"
					? { ...clip, cleanedAudio: { sourcePath: mic, path: cleaned } }
					: clip,
			),
		);
		const byUrl = (url: string) =>
			prepared.companionEntries.find(
				(entry) => (entry.buffer as unknown as { url: string }).url === url,
			);
		// System sound is untouched; the original voice is silent on the filtered clip.
		expect(byUrl("/rec/recording-1.system.m4a")?.mutedOutputRangesSec).toBeUndefined();
		expect(byUrl(mic)?.mutedOutputRangesSec).toEqual(ranges([6, 9], [3, 6]));
		// The cleaned voice is heard on the filtered clip alone.
		expect(byUrl(cleaned)?.mutedOutputRangesSec).toEqual(ranges([6, 9], [0, 3], [6, 9]));
		expect(byUrl(cleaned)?.gain).toBe(byUrl(mic)?.gain);
	});

	it("swap the recording's own sound when the microphone is its only audio", async () => {
		const video = "/rec/recording-2.mp4";
		const cleaned = "/rec/recording-2.mic.clean50.m4a";
		const prepared = await new TestAudioProcessor().prepare(
			video,
			[],
			[],
			[],
			[],
			undefined,
			undefined,
			clips.map((clip) =>
				clip.id === "a"
					? { ...clip, cleanedAudio: { sourcePath: video, path: cleaned } }
					: clip,
			),
		);
		expect(prepared.mainBufferEntry?.mutedOutputRangesSec).toEqual(ranges([6, 9], [0, 3]));
		expect(prepared.companionEntries).toHaveLength(1);
		expect(prepared.companionEntries[0].mutedOutputRangesSec).toEqual(
			ranges([6, 9], [3, 6], [6, 9]),
		);
	});
});
