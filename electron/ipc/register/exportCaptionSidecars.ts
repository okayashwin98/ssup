import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";

const run = promisify(execFile);

export type CaptionSidecarCue = {
	startMs: number;
	endMs: number;
	text: string;
};

export type CaptionSidecarPayload = {
	/** Which caption files to write next to the video ("none" for neither). */
	format: "srt" | "vtt" | "both" | "none";
	cues: CaptionSidecarCue[];
	/** Also store the captions inside an MP4 as an on/off subtitle track. */
	embed?: boolean;
	language?: string;
};

export type CaptionSidecarWriteResult = {
	wroteAny: boolean;
	error: string | null;
};

function toSrtTimestamp(totalMs: number): string {
	const ms = Math.max(0, Math.round(totalMs));
	const hours = Math.floor(ms / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	const millis = ms % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function toVttTimestamp(totalMs: number): string {
	const ms = Math.max(0, Math.round(totalMs));
	const hours = Math.floor(ms / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	const millis = ms % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function normalizeCaptionSidecarCues(cues: unknown): CaptionSidecarCue[] {
	if (!Array.isArray(cues)) {
		return [];
	}

	return cues
		.filter((cue): cue is CaptionSidecarCue => {
			return (
				typeof cue === "object" &&
				cue !== null &&
				typeof cue.startMs === "number" &&
				typeof cue.endMs === "number" &&
				typeof cue.text === "string" &&
				Number.isFinite(cue.startMs) &&
				Number.isFinite(cue.endMs) &&
				cue.endMs > cue.startMs &&
				cue.text.trim().length > 0
			);
		})
		.map((cue) => ({
			startMs: cue.startMs,
			endMs: cue.endMs,
			text: cue.text.replace(/\r\n/g, "\n").trim(),
		}));
}

export function parseCaptionSidecarPayload(payload: unknown): CaptionSidecarPayload | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}

	const candidate = payload as {
		format?: unknown;
		cues?: unknown;
		embed?: unknown;
		language?: unknown;
	};

	const format =
		candidate.format === "srt" ||
		candidate.format === "vtt" ||
		candidate.format === "both" ||
		candidate.format === "none"
			? candidate.format
			: null;
	if (!format) {
		return null;
	}

	const cues = normalizeCaptionSidecarCues(candidate.cues);
	if (cues.length === 0) {
		return null;
	}

	return {
		format,
		cues,
		embed: candidate.embed === true,
		language: typeof candidate.language === "string" ? candidate.language : undefined,
	};
}

export function serializeSrt(cues: CaptionSidecarCue[]): string {
	return cues
		.map((cue, index) => {
			return `${index + 1}\n${toSrtTimestamp(cue.startMs)} --> ${toSrtTimestamp(cue.endMs)}\n${cue.text}`;
		})
		.join("\n\n");
}

export function serializeVtt(cues: CaptionSidecarCue[]): string {
	const body = cues
		.map((cue) => {
			return `${toVttTimestamp(cue.startMs)} --> ${toVttTimestamp(cue.endMs)}\n${cue.text}`;
		})
		.join("\n\n");
	return `WEBVTT\n\n${body}`;
}

// MP4 subtitle tracks name their language with ISO 639-2 codes.
const ISO_639_2: Record<string, string> = {
	ar: "ara",
	de: "deu",
	en: "eng",
	es: "spa",
	fr: "fra",
	hi: "hin",
	it: "ita",
	ja: "jpn",
	ko: "kor",
	nl: "nld",
	pl: "pol",
	pt: "por",
	ru: "rus",
	sv: "swe",
	tr: "tur",
	uk: "ukr",
	zh: "zho",
};

/**
 * Stores the captions inside an MP4 as a subtitle track that players can turn
 * on or off. Picture and sound are copied untouched.
 */
export async function embedCaptionTrack(
	videoPath: string,
	cues: CaptionSidecarCue[],
	language?: string,
) {
	const parsed = path.parse(videoPath);
	const stamp = `${process.pid}-${Date.now()}`;
	const srtPath = path.join(parsed.dir, `.${parsed.name}.captions-${stamp}.srt`);
	const outputPath = path.join(parsed.dir, `.${parsed.name}.captions-${stamp}${parsed.ext}`);
	const languageCode = ISO_639_2[(language ?? "").toLowerCase().slice(0, 2)] ?? "und";
	try {
		await fs.writeFile(srtPath, serializeSrt(cues), "utf8");
		await run(
			getFfmpegBinaryPath(),
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-nostdin",
				"-y",
				"-i",
				videoPath,
				"-i",
				srtPath,
				"-map",
				"0",
				"-map",
				"1:s:0",
				"-map_metadata",
				"0",
				"-c",
				"copy",
				"-c:s",
				"mov_text",
				"-metadata:s:s:0",
				`language=${languageCode}`,
				"-metadata:s:s:0",
				"handler_name=Captions",
				"-movflags",
				"+faststart",
				outputPath,
			],
			{ timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024 },
		);
		await fs.rename(outputPath, videoPath);
	} finally {
		await fs.rm(srtPath, { force: true });
		await fs.rm(outputPath, { force: true });
	}
}

export async function writeCaptionSidecars(
	videoPath: string,
	payload: CaptionSidecarPayload | null,
) {
	if (!payload) {
		return;
	}

	const parsed = path.parse(videoPath);
	const basePath = path.join(parsed.dir, parsed.name);

	if (payload.format === "srt" || payload.format === "both") {
		await fs.writeFile(`${basePath}.srt`, serializeSrt(payload.cues), "utf8");
	}

	if (payload.format === "vtt" || payload.format === "both") {
		await fs.writeFile(`${basePath}.vtt`, serializeVtt(payload.cues), "utf8");
	}

	if (payload.embed && parsed.ext.toLowerCase() === ".mp4") {
		await embedCaptionTrack(videoPath, payload.cues, payload.language);
	}
}

export async function writeCaptionSidecarsBestEffort(
	videoPath: string,
	payload: CaptionSidecarPayload | null,
): Promise<CaptionSidecarWriteResult> {
	if (!payload) {
		return { wroteAny: false, error: null };
	}

	try {
		await writeCaptionSidecars(videoPath, payload);
		return { wroteAny: true, error: null };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn("[export] Failed to write caption sidecars:", {
			videoPath,
			message,
		});
		return { wroteAny: false, error: message };
	}
}

export function withCaptionSidecarMessage(
	baseMessage: string,
	captionSidecarResult: CaptionSidecarWriteResult,
) {
	if (!captionSidecarResult.error) {
		return baseMessage;
	}

	return `${baseMessage} Captions could not be added to the video.`;
}
