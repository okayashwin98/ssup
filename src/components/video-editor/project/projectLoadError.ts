/** A project that failed to open: which file, why, and where its recording was. */
export type ProjectLoadFailure = {
	message: string;
	code?: string;
	projectPath?: string | null;
	recordingPath?: string;
	driveName?: string;
};

export type ProjectLoadErrorCopy = {
	title: string;
	description: string;
	/** A missing recording can be found again with Locate recording. */
	canLocate: boolean;
};

/** The cause in plain words, from the app's reason code or, failing that, its message. */
export function describeProjectLoadError(failure: ProjectLoadFailure): ProjectLoadErrorCopy {
	const code = failure.code ?? guessCode(failure.message);
	switch (code) {
		case "corrupt":
			return {
				title: "This project couldn’t be read",
				description:
					"Its file is damaged or isn’t a SuperShare project. SuperShare hasn’t changed it.",
				canLocate: false,
			};
		case "project-missing":
			return {
				title: "This project’s file is missing",
				description: "It may have been moved, renamed or deleted.",
				canLocate: false,
			};
		case "no-access":
			return {
				title: "SuperShare isn’t allowed to open this project",
				description:
					"The Mac blocked access to its file or folder. Check the folder’s permissions, then try again.",
				canLocate: false,
			};
		case "missing-recording":
			return {
				title: "The project’s recording is missing",
				description:
					"It may have been moved, renamed or deleted. Locate it to reconnect the project; your edits are kept.",
				canLocate: true,
			};
		case "drive-disconnected":
			return {
				title: "The recording is on a drive that isn’t connected",
				description: `Connect ${failure.driveName ? `“${failure.driveName}”` : "the drive"} and try again, or locate a copy of the recording.`,
				canLocate: true,
			};
		case "unsupported-format":
			return {
				title: "The recording’s format isn’t supported",
				description:
					"SuperShare can’t play this recording. Its format may not be supported, or the file may have changed.",
				canLocate: false,
			};
		case "unplayable":
			return {
				title: "The recording couldn’t be played",
				description:
					"Check that the recording and its drive are available, then try again.",
				canLocate: false,
			};
		default:
			return {
				title: "This project couldn’t be opened",
				description: "Try again. If it keeps happening, save a report.",
				canLocate: false,
			};
	}
}

function guessCode(message: string) {
	if (/Project video file not found/i.test(message)) return "missing-recording";
	if (/invalid project|SyntaxError|JSON/i.test(message)) return "corrupt";
	if (/EACCES|EPERM|permission denied|not permitted/i.test(message)) return "no-access";
	if (/format not supported|not supported|decode/i.test(message)) return "unsupported-format";
	if (/Failed to load video/i.test(message)) return "unplayable";
	return "unknown";
}

/** The file's own name, for showing which project or recording failed. */
export function fileNameOf(filePath: string) {
	return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

/** Everything "Copy details" and the report need about the failure. */
export function projectLoadDetails(failure: ProjectLoadFailure) {
	return [
		failure.message,
		failure.code ? `Reason: ${failure.code}` : "",
		failure.projectPath ? `Project: ${failure.projectPath}` : "",
		failure.recordingPath ? `Recording: ${failure.recordingPath}` : "",
		failure.driveName ? `Drive: ${failure.driveName}` : "",
	]
		.filter(Boolean)
		.join("\n");
}
