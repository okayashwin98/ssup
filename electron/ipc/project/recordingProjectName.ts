import path from "node:path";
import type { SelectedSource } from "../types";

const RECORDING_FILE_PATTERN = /^recording-(\d{12,14})\./;
// A project created long after its recording no longer knows which source was used.
const SOURCE_MATCH_WINDOW_MS = 15 * 60 * 1000;

export type RecordingSourceName = { label: string; startedAt: number };

/** "Screen recording" for screens and areas, otherwise the recorded window's title. */
export function getRecordingSourceLabel(source: SelectedSource | null): string {
	if (source?.sourceType === "window" || source?.id?.startsWith("window:")) {
		const title = source.windowTitle || source.name || source.appName;
		if (typeof title === "string" && title.trim()) return title;
	}
	return "Screen recording";
}

function toFileSafeName(value: string) {
	return (
		value
			.replace(/[\\/:*?"<>|]/g, " ")
			.replace(/\p{Cc}/gu, " ")
			.replace(/\s+/g, " ")
			.trim()
			// A leading dot would hide the project's recordings folder.
			.replace(/^\.+\s*/, "")
			.slice(0, 80)
			// Same rule as typed names: no trailing dot or space.
			.replace(/[. ]+$/, "")
	);
}

/** Project name for a new recording, e.g. "Figma – Oct 23, 2026"; null for imported media. */
export function buildRecordingProjectName(
	videoPath: unknown,
	lastRecording: RecordingSourceName | null,
): string | null {
	if (typeof videoPath !== "string") return null;
	const match = RECORDING_FILE_PATTERN.exec(path.basename(videoPath));
	if (!match) return null;
	const recordedAt = Number(match[1]);
	const label =
		lastRecording && Math.abs(recordedAt - lastRecording.startedAt) <= SOURCE_MATCH_WINDOW_MS
			? lastRecording.label
			: "Recording";
	const date = new Date(recordedAt).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	return toFileSafeName(`${toFileSafeName(label) || "Recording"} – ${date}`) || null;
}
