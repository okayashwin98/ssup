import type { ProjectPreviewData } from "@/types/projectPreview";
import { normalizeProjectEditor } from "../projectPersistence";
import { renderProjectThumbnail } from "../projectThumbnailRender";
import type { CursorTelemetryPoint } from "../types";

/** Render a saved project's opening frame with its saved look, as the editor does on save. */
export async function generateProjectThumbnail(data: ProjectPreviewData): Promise<string> {
	const editor = normalizeProjectEditor(data.project.editor);
	let cursorTelemetry: CursorTelemetryPoint[] = [];
	try {
		// Cursor positions live beside the recording, not in the project file.
		const result = await window.electronAPI.getCursorTelemetry(data.project.videoPath);
		if (result.success) cursorTelemetry = result.samples;
	} catch {
		// A missing cursor file must not stop the rest of the preview.
	}
	return renderProjectThumbnail(data.videoUrl, {
		...editor,
		cursorTelemetry,
		webcamUrl: data.webcamUrl,
	});
}
