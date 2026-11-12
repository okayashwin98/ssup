import path from "node:path";

/** The cleaned voice copies noise and filler removal make, e.g. "x.mic.clean100-nofill.m4a". */
export function isCleanedVoiceCopy(name: string) {
	return /\.mic\.(?:clean\d+(?:-nofill)?|nofill)\.m4a$/i.test(name);
}

// Only capture sidecars belonging to this exact recording, never adjacent recordings or projects.
export function belongsToRecording(name: string, video: string) {
	const stem = video.slice(0, -path.extname(video).length);
	return (
		name === video ||
		name === `${video}.cursor.json` ||
		(name.startsWith(`${stem}.`) &&
			/\.(?:system|mic|microphone|audio|webcam)\.(?:wav|webm|mp4|m4a)(?:\.json)?$/i.test(
				name,
			)) ||
		(name.startsWith(`${stem}.`) && isCleanedVoiceCopy(name)) ||
		name === `${stem}.recordly-session.json` ||
		name === `${stem}.recording-session.json` ||
		(name.startsWith(`${stem}-webcam.`) && /\.(?:mp4|webm|mov|mkv|avi)$/i.test(name))
	);
}
