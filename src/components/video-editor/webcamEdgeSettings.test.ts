import { describe, expect, it } from "vitest";
import {
	DEFAULT_EDITOR_PREFERENCES,
	normalizeEditorPreferences,
	serializeEditorPresetSnapshot,
} from "./editorPreferences";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";
import { DEFAULT_AUTO_CAPTION_SETTINGS, DEFAULT_CROP_REGION } from "./types";
import { getWebcamEdgeFeatherPixels } from "./webcamEdgeFeather";

describe("webcam soft edge setting", () => {
	it("leaves a project saved before the setting without it, so its webcam keeps a sharp edge", () => {
		const editor = normalizeProjectEditor({
			webcam: { enabled: true, roundness: 40 } as never,
		});
		expect("previewFrame" in editor.webcam).toBe(false);
		expect(getWebcamEdgeFeatherPixels(editor.webcam.previewFrame, 1920)).toBe(0);
		expect(JSON.stringify(createProjectData("/tmp/video.mp4", editor))).not.toContain(
			"previewFrame",
		);
	});

	it("turns soft edges on for new projects, including with older saved preferences", () => {
		expect(DEFAULT_EDITOR_PREFERENCES.webcam.previewFrame).toBe("soft-blur");
		expect(normalizeEditorPreferences({}).webcam.previewFrame).toBe("soft-blur");
		expect(
			normalizeEditorPreferences({ webcam: { enabled: false, roundness: 20 } }).webcam
				.previewFrame,
		).toBe("soft-blur");
		expect(getWebcamEdgeFeatherPixels("soft-blur", 1920)).toBe(16);
		expect(getWebcamEdgeFeatherPixels("soft-blur", 960)).toBe(8);
	});

	it("keeps an explicit choice through project and preference reloads", () => {
		for (const value of ["standard", "soft-blur"] as const) {
			const project = normalizeProjectEditor({ webcam: { previewFrame: value } as never });
			expect(
				normalizeProjectEditor(JSON.parse(JSON.stringify(project))).webcam.previewFrame,
			).toBe(value);
			const preferences = normalizeEditorPreferences({ webcam: { previewFrame: value } });
			expect(
				normalizeEditorPreferences(JSON.parse(JSON.stringify(preferences))).webcam
					.previewFrame,
			).toBe(value);
		}
		expect(
			"previewFrame" in
				normalizeProjectEditor({ webcam: { previewFrame: "x" } as never }).webcam,
		).toBe(false);
	});

	it("does not let an older project's missing value overwrite the stored preference", () => {
		const stored = normalizeEditorPreferences({ webcam: { previewFrame: "standard" } });
		const { previewFrame: _missing, ...olderWebcam } = stored.webcam;
		expect(
			normalizeEditorPreferences({ ...stored, webcam: olderWebcam }, stored).webcam
				.previewFrame,
		).toBe("standard");
	});

	it("saves the edge in new presets and leaves it out of presets that never had it", () => {
		const base = {
			...DEFAULT_EDITOR_PREFERENCES,
			cropRegion: DEFAULT_CROP_REGION,
			autoCaptionSettings: DEFAULT_AUTO_CAPTION_SETTINGS,
		};
		expect(
			JSON.parse(
				serializeEditorPresetSnapshot({
					...base,
					webcam: { ...base.webcam, previewFrame: "standard" },
				}),
			).webcam.previewFrame,
		).toBe("standard");
		const { previewFrame: _omitted, ...legacyWebcam } = base.webcam;
		expect(
			"previewFrame" in
				JSON.parse(serializeEditorPresetSnapshot({ ...base, webcam: legacyWebcam })).webcam,
		).toBe(false);
	});
});
