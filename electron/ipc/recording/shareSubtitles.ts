import {
	CAPTION_GLOSSARY_SETTING,
	normalizeCaptionGlossary,
} from "../../../src/lib/captionGlossary";
import { readAppSetting } from "../../appSettingsStore";
import { generateAutoCaptionsFromVideo } from "../captions/generate";
import { getWhisperSmallModelStatus } from "../captions/whisper";

export type ShareSubtitleSegment = { startTime: number; endTime: number; text: string };

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
