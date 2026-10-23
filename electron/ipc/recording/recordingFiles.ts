import path from "node:path";

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
		name === `${stem}.recordly-session.json` ||
		name === `${stem}.recording-session.json` ||
		(name.startsWith(`${stem}-webcam.`) && /\.(?:mp4|webm|mov|mkv|avi)$/i.test(name))
	);
}
