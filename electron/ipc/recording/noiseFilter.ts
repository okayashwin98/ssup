import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
	CAPTION_GLOSSARY_SETTING,
	normalizeCaptionGlossary,
} from "../../../src/lib/captionGlossary";
import { normalizeNoiseFilterStrength } from "../../../src/lib/noiseFilterStrength";
import { readAppSetting } from "../../appSettingsStore";
import { resolveWhisperExecutablePath } from "../captions/generate";
import { readWhisperCaptionOutput } from "../captions/output";
import { getWhisperSmallModelStatus } from "../captions/whisper";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { getPrebundledNativeHelperPath, resolveUnpackedAppPath } from "../paths/binaries";
import {
	confirmFillerSpans,
	detectFillerSpans,
	FILLER_FRAME_MS,
	type FillerSpan,
	findRoomToneFrame,
	isFillerWord,
	makeFillerMix,
	parseFillerFrames,
} from "./fillerSpans";

const execFileAsync = promisify(execFile);

/** What to clean from a recording's voice: background noise at a strength, and/or fillers. */
export type VoiceCleanup = { noise?: number; fillers?: boolean };

/** RNNoise's general speech model ("std", richardpl/arnndn-models), run by ffmpeg's arnndn. */
export function getNoiseModelPath() {
	return resolveUnpackedAppPath("electron", "native", "bin", "rnnoise", "std.rnnn");
}

/** The Clarity filler detector (MIT, arkaydeus), compiled for Core ML. */
function getFillerModelPath() {
	return resolveUnpackedAppPath(
		"electron",
		"native",
		"bin",
		"filler-detector",
		"FillerDetector-v3.mlmodelc",
	);
}

/**
 * Where the cleaned copy of a recording's voice lives: next to it, in the project's folder.
 * "recording-1.mic.m4a" or "recording-1.mp4" noise-filtered at full strength gives
 * "recording-1.mic.clean100.m4a"; with fillers removed too, "recording-1.mic.clean100-nofill.m4a".
 * The ".mic." keeps it routed as the microphone.
 */
export function getCleanedAudioPath(sourcePath: string, cleanup: VoiceCleanup) {
	const base = sourcePath.replace(/\.[^./\\]+$/, "").replace(/\.mic$/i, "");
	const parts = [
		cleanup.noise
			? `clean${Math.round(normalizeNoiseFilterStrength(cleanup.noise) * 100)}`
			: "",
		cleanup.fillers ? "nofill" : "",
	].filter(Boolean);
	return `${base}.mic.${parts.join("-")}.m4a`;
}

function noiseFilterArgs(cleanup: VoiceCleanup) {
	if (!cleanup.noise) return [];
	const model = getNoiseModelPath().replace(/'/g, "'\\''");
	return ["-af", `arnndn=m='${model}':mix=${normalizeNoiseFilterStrength(cleanup.noise)}`];
}

const pending = new Map<string, Promise<string>>();

/** Makes (once) and returns the cleaned copy of a recording's voice. */
export function createCleanedAudio(sourcePath: string, cleanup: VoiceCleanup): Promise<string> {
	if (!cleanup.noise && !cleanup.fillers) return Promise.reject(new Error("Nothing to clean"));
	const outputPath = getCleanedAudioPath(sourcePath, cleanup);
	const existing = pending.get(outputPath);
	if (existing) return existing;
	const job = (async () => {
		const [source, output] = await Promise.all([
			fs.stat(sourcePath),
			fs.stat(outputPath).catch(() => null),
		]);
		if (output && output.size > 0 && output.mtimeMs >= source.mtimeMs) return outputPath;
		const ffmpeg = getFfmpegBinaryPath();
		if (!ffmpeg) throw new Error("FFmpeg is not available");
		const tempPath = `${outputPath}.part.m4a`;
		try {
			if (cleanup.fillers) {
				const plan = await planFillerRemoval(ffmpeg, sourcePath);
				await renderWithRoomTone(ffmpeg, sourcePath, tempPath, cleanup, plan);
			} else {
				await execFileAsync(
					ffmpeg,
					[
						"-hide_banner",
						"-nostdin",
						"-y",
						"-i",
						sourcePath,
						"-vn",
						...noiseFilterArgs(cleanup),
						"-c:a",
						"aac",
						"-b:a",
						"192k",
						tempPath,
					],
					{ timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
				);
			}
			await fs.rename(tempPath, outputPath);
			return outputPath;
		} catch (error) {
			await fs.rm(tempPath, { force: true }).catch(() => undefined);
			throw error;
		}
	})().finally(() => pending.delete(outputPath));
	pending.set(outputPath, job);
	return job;
}

type FillerPlan = { spans: FillerSpan[]; roomToneStartMs: number };

/**
 * Finds the fillers to remove, from the original sound: the detector's, cross-checked with
 * the fillers the speech model writes out. Also picks the room sound to fill them with.
 */
async function planFillerRemoval(ffmpeg: string, sourcePath: string): Promise<FillerPlan> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-fillers-"));
	try {
		const raw = path.join(dir, "audio.f32");
		await execFileAsync(
			ffmpeg,
			[
				"-hide_banner",
				"-nostdin",
				"-y",
				"-i",
				sourcePath,
				"-vn",
				"-ac",
				"1",
				"-ar",
				"16000",
				"-f",
				"f32le",
				raw,
			],
			{ timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
		);
		const framesPath = path.join(dir, "frames.csv");
		await execFileAsync(
			getPrebundledNativeHelperPath("recordly-filler-detector"),
			[getFillerModelPath(), raw, framesPath],
			{ timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
		);
		const frames = parseFillerFrames(await fs.readFile(framesPath, "utf8"));
		const bytes = await fs.readFile(raw);
		const samples = new Float32Array(
			bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.length - (bytes.length % 4),
			),
		);
		const perFrame = (16000 * FILLER_FRAME_MS) / 1000;
		const levels = frames.map((_, f) => {
			let sum = 0;
			for (let i = f * perFrame; i < Math.min(samples.length, (f + 1) * perFrame); i++)
				sum += samples[i] * samples[i];
			return Math.sqrt(sum / perFrame);
		});
		const transcript = await transcribeFillers(ffmpeg, raw, dir).catch((error) => {
			console.warn("Filler cross-check without a transcript:", error);
			return null;
		});
		return {
			spans: confirmFillerSpans(detectFillerSpans(frames), transcript),
			roomToneStartMs: findRoomToneFrame(frames, levels) * FILLER_FRAME_MS,
		};
	} finally {
		await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
	}
}

/** Start times of the fillers the speech model writes out when its prompt shows them. */
async function transcribeFillers(ffmpeg: string, rawPath: string, dir: string) {
	const model = await getWhisperSmallModelStatus();
	if (!model.exists || !model.path) return null;
	const wav = path.join(dir, "audio.wav");
	await execFileAsync(
		ffmpeg,
		[
			"-hide_banner",
			"-nostdin",
			"-y",
			"-f",
			"f32le",
			"-ar",
			"16000",
			"-ac",
			"1",
			"-i",
			rawPath,
			"-c:a",
			"pcm_s16le",
			wav,
		],
		{ timeout: 10 * 60 * 1000 },
	);
	const glossary = normalizeCaptionGlossary(readAppSetting(CAPTION_GLOSSARY_SETTING));
	const prompt =
		`Um, uh, er, erm, ah, hmm. So, um, I was, uh, thinking. Uh, yeah. ${glossary}`.trim();
	const outputBase = path.join(dir, "transcript");
	await execFileAsync(
		await resolveWhisperExecutablePath(),
		[
			"-m",
			model.path,
			"-f",
			wav,
			"-ojf",
			"-of",
			outputBase,
			"-l",
			"auto",
			"--prompt",
			prompt,
			"--carry-initial-prompt",
			"-np",
			"-mc",
			"40",
		],
		{ timeout: 30 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 },
	);
	const cues = await readWhisperCaptionOutput(outputBase, true);
	return cues.flatMap((cue) =>
		(cue.words ?? []).filter((word) => isFillerWord(word.text)).map((word) => word.startMs),
	);
}

/**
 * Writes the voice with each filler replaced by the room's own background sound, crossfaded
 * so nothing drops out; noise-filtered first when asked, the room sound with it so they match.
 * Streams through ffmpeg, so long recordings never sit in memory.
 */
async function renderWithRoomTone(
	ffmpeg: string,
	sourcePath: string,
	outputPath: string,
	cleanup: VoiceCleanup,
	plan: FillerPlan,
) {
	const sampleRate = 48000;
	const decodeArgs = [
		"-vn",
		"-ac",
		"1",
		"-ar",
		String(sampleRate),
		...noiseFilterArgs(cleanup),
		"-f",
		"f32le",
		"pipe:1",
	];
	const tone = await new Promise<Float32Array>((resolve, reject) => {
		execFile(
			ffmpeg,
			[
				"-hide_banner",
				"-nostdin",
				"-ss",
				String(plan.roomToneStartMs / 1000),
				"-t",
				"0.5",
				"-i",
				sourcePath,
				...decodeArgs,
			],
			{ encoding: "buffer", maxBuffer: 10 * 1024 * 1024, timeout: 60000 },
			(error, stdout) =>
				error
					? reject(error)
					: resolve(
							new Float32Array(
								stdout.buffer.slice(
									stdout.byteOffset,
									stdout.byteOffset + stdout.length - (stdout.length % 4),
								),
							),
						),
		);
	});
	const mixAt = makeFillerMix(plan.spans, sampleRate);
	const decoder = spawn(ffmpeg, ["-hide_banner", "-nostdin", "-i", sourcePath, ...decodeArgs]);
	const encoder = spawn(ffmpeg, [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-f",
		"f32le",
		"-ar",
		String(sampleRate),
		"-ac",
		"1",
		"-i",
		"pipe:0",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		outputPath,
	]);
	const finished = (child: ReturnType<typeof spawn>, name: string) =>
		new Promise<void>((resolve, reject) => {
			child.on("error", reject);
			child.on("close", (code) =>
				code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`)),
			);
		});
	const encoded = finished(encoder, "Audio encoding");
	const decoded = finished(decoder, "Audio decoding");
	// If the encoder stops early, writing to it fails; its exit code reports the failure instead.
	encoder.stdin.on("error", () => decoder.kill());
	let index = 0;
	let carry = Buffer.alloc(0);
	decoder.stdout.on("data", (chunk: Buffer) => {
		const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk;
		const whole = bytes.length - (bytes.length % 4);
		carry = Buffer.from(bytes.subarray(whole));
		const input = new Float32Array(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + whole),
		);
		const output = new Float32Array(input.length);
		for (let i = 0; i < input.length; i++, index++) {
			const keep = mixAt(index);
			output[i] =
				keep >= 1
					? input[i]
					: input[i] * Math.sin((keep * Math.PI) / 2) +
						(tone.length ? tone[index % tone.length] : 0) *
							Math.cos((keep * Math.PI) / 2);
		}
		if (!encoder.stdin.write(Buffer.from(output.buffer))) {
			decoder.stdout.pause();
			encoder.stdin.once("drain", () => decoder.stdout.resume());
		}
	});
	decoder.stdout.on("end", () => encoder.stdin.end());
	await Promise.all([decoded, encoded]);
}
