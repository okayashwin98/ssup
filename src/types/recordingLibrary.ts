export interface RecordingWebcamSource {
	sourcePath: string | null;
	timeOffsetMs: number;
	visibleRanges?: { startMs: number; endMs: number }[];
}
export interface RecordingLibraryEntry {
	path: string;
	name: string;
	createdAt: number;
	bytes: number;
	durationMs?: number;
	url: string;
	/** The project folder this file lives in; absent for loose files. */
	folder?: string;
}
/** A recording no saved project uses, with its companion files, offered by "Free up space". */
export interface UnusedRecording {
	/** The recording's video, or the stray file itself when its video is gone. */
	path: string;
	name: string;
	/** The project folder it sits in; absent for loose files. */
	folder?: string;
	files: Array<{ path: string; bytes: number }>;
	bytes: number;
	modifiedAt: number;
}
export interface RecordingImportResult {
	path: string;
	url: string;
	sourceStartMs: number;
	durationMs: number;
	totalDurationMs: number;
	webcam?: RecordingWebcamSource;
}
export type LibraryResult<T> = { success: true; value: T } | { success: false; error: string };
export const RECORDING_DRAG_TYPE = "application/x-recordly-recording";
