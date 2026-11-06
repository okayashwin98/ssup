import {
	CAPTION_GLOSSARY_SETTING,
	normalizeCaptionGlossary,
} from "../../../src/lib/captionGlossary";
import { readAppSetting } from "../../appSettingsStore";
import { splitLongCue } from "../../../src/lib/captionSplit";
import { generateAutoCaptionsFromVideo } from "../captions/generate";
import { getWhisperSmallModelStatus } from "../captions/whisper";

export type ShareSubtitleSegment = { startTime: number; endTime: number; text: string };

/** The share site refuses a transcript longer than this (hostedUploads.js). */
export const MAX_SHARE_SUBTITLES = 5000;

/** Joins neighbouring subtitles in pairs until the list fits the share site's limit. */
export function fitShareSubtitleLimit(segments: ShareSubtitleSegment[]): ShareSubtitleSegment[] {
	let fitted = segments;
	while (fitted.length > MAX_SHARE_SUBTITLES) {
		const joined: ShareSubtitleSegment[] = [];
		for (let i = 0; i < fitted.length; i += 2) {
			const next = fitted[i + 1];
			joined.push(
				next
					? {
							startTime: fitted[i].startTime,
							endTime: next.endTime,
							text: `${fitted[i].text} ${next.text}`,
						}
					: fitted[i],
			);
		}
		fitted = joined;
	}
	return fitted;
}

/**
 * Transcribes the exact file being shared, so the timing already matches the
 * edited video. Returns null when there is no speech model or no audio.
 */
export async function createShareSubtitles(
	videoPath: string,
): Promise<ShareSubtitleSegment[] | null> {
	const model = await getWhisperSmallModelStatus();
	if (!model.exists || !model.path) return null;
	try {
		const { cues } = await generateAutoCaptionsFromVideo({
			videoPath,
			whisperModelPath: model.path,
			prompt: normalizeCaptionGlossary(readAppSetting(CAPTION_GLOSSARY_SETTING)),
		});
		const segments = cues
			.flatMap(splitLongCue)
			.map((cue) => ({
				startTime: cue.startMs / 1000,
				endTime: cue.endMs / 1000,
				text: cue.text.trim(),
			}))
			.filter((segment) => segment.text && segment.endTime > segment.startTime);
		return segments.length ? segments : null;
	} catch (error) {
		console.warn("Share subtitles skipped:", error);
		return null;
	}
}
