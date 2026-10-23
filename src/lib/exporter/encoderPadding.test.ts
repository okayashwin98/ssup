import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioProcessor } from "./audioEncoder";

type Feed = (
	encoder: AudioEncoder,
	buffer: AudioBuffer,
	timestampOffsetSec: number,
	skipLeadingFrames?: number,
) => Promise<void>;

class FakeAudioData {
	timestamp: number;
	numberOfFrames: number;
	firstSample: number;
	constructor(init: { timestamp: number; numberOfFrames: number; data: Float32Array }) {
		this.timestamp = init.timestamp;
		this.numberOfFrames = init.numberOfFrames;
		this.firstSample = init.data[0];
	}
	close() {}
}

// A mono buffer whose sample values are their own frame numbers.
function buffer(frames: number, firstFrame: number): AudioBuffer {
	const data = Float32Array.from({ length: frames }, (_, index) => firstFrame + index);
	return {
		sampleRate: 48_000,
		numberOfChannels: 1,
		length: frames,
		getChannelData: () => data,
	} as unknown as AudioBuffer;
}

afterEach(() => vi.unstubAllGlobals());

describe("feeding the export's AAC encoder", () => {
	it("leaves out the encoder's padding and shifts the rest to start at zero", async () => {
		vi.stubGlobal("AudioData", FakeAudioData);
		const encoded: FakeAudioData[] = [];
		const encoder = { encode: (data: FakeAudioData) => encoded.push(data), encodeQueueSize: 0 };
		const feed = (new AudioProcessor() as unknown as { feedBufferToEncoder: Feed })
			.feedBufferToEncoder;
		const processor = new AudioProcessor();
		// Two rendered chunks: frames 0-4799, then frames 4800-9599 starting at 0.1 s.
		await feed.call(processor, encoder as never, buffer(4800, 0), 0, 2112);
		await feed.call(processor, encoder as never, buffer(4800, 4800), 0.1, 2112);
		expect(encoded[0]).toMatchObject({ timestamp: 0, firstSample: 2112 });
		const second = encoded.find((data) => data.firstSample === 4800)!;
		expect(second.timestamp).toBe(Math.round(((4800 - 2112) / 48_000) * 1_000_000));
		const total = encoded.reduce((sum, data) => sum + data.numberOfFrames, 0);
		expect(total).toBe(9600 - 2112);
	});

	it("feeds everything unchanged without padding", async () => {
		vi.stubGlobal("AudioData", FakeAudioData);
		const encoded: FakeAudioData[] = [];
		const encoder = { encode: (data: FakeAudioData) => encoded.push(data), encodeQueueSize: 0 };
		const processor = new AudioProcessor() as unknown as { feedBufferToEncoder: Feed };
		await processor.feedBufferToEncoder(encoder as never, buffer(2048, 0), 0.5);
		expect(encoded.map((data) => data.timestamp)).toEqual([500_000, 521_333]);
	});
});
