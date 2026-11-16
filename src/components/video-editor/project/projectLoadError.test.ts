import { describe, expect, it } from "vitest";
import { describeProjectLoadError, projectLoadDetails } from "./projectLoadError";

describe("project load error", () => {
	it("explains each cause in plain words", () => {
		expect(describeProjectLoadError({ message: "x", code: "corrupt" }).title).toBe(
			"This project couldn’t be read",
		);
		expect(describeProjectLoadError({ message: "x", code: "missing-recording" })).toMatchObject(
			{
				title: "The project’s recording is missing",
				canLocate: true,
			},
		);
		const drive = describeProjectLoadError({
			message: "x",
			code: "drive-disconnected",
			driveName: "Studio SSD",
		});
		expect(drive.description).toContain("“Studio SSD”");
		expect(drive.canLocate).toBe(true);
		expect(
			describeProjectLoadError({ message: "Failed to load video (format not supported)" })
				.title,
		).toBe("The recording’s format isn’t supported");
		expect(describeProjectLoadError({ message: "Invalid project file format" }).canLocate).toBe(
			false,
		);
		expect(describeProjectLoadError({ message: "something odd" }).title).toBe(
			"This project couldn’t be opened",
		);
	});

	it("keeps full paths in the details", () => {
		expect(
			projectLoadDetails({
				message: "Project video file not found: /Volumes/SSD/a.mp4",
				code: "drive-disconnected",
				projectPath: "/Users/me/Recordings/A/A.ssup",
				recordingPath: "/Volumes/SSD/a.mp4",
				driveName: "SSD",
			}),
		).toBe(
			"Project video file not found: /Volumes/SSD/a.mp4\nReason: drive-disconnected\nProject: /Users/me/Recordings/A/A.ssup\nRecording: /Volumes/SSD/a.mp4\nDrive: SSD",
		);
	});
});
