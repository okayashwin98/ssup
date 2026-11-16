import { describe, expect, it } from "vitest";
import {
	DEFAULT_EDITOR_PREFERENCES,
	normalizeEditorPreferences,
	serializeEditorPresetSnapshot,
} from "./editorPreferences";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";
import { DEFAULT_AUTO_CAPTION_SETTINGS, DEFAULT_CROP_REGION } from "./types";

describe("cursor idle setting persistence", () => {
	it("leaves a project saved before the setting without it, so its cursor never hides", () => {
		const editor = normalizeProjectEditor({ showCursor: true, cursorSize: 3 });
		expect("cursorIdleHide" in editor).toBe(false);
		expect(JSON.stringify(createProjectData("/tmp/video.mp4", editor))).not.toContain(
			"cursorIdleHide",
		);
	});

	it("turns it on for new projects, including for people with older saved preferences", () => {
		expect(DEFAULT_EDITOR_PREFERENCES.cursorIdleHide).toBe(true);
		expect(normalizeEditorPreferences({}).cursorIdleHide).toBe(true);
		expect(normalizeEditorPreferences({ cursorSize: 2 }).cursorIdleHide).toBe(true);
	});

	it("keeps an explicit choice through project and preference reloads", () => {
		for (const value of [true, false]) {
			const project = normalizeProjectEditor({ cursorIdleHide: value });
			expect(normalizeProjectEditor(JSON.parse(JSON.stringify(project))).cursorIdleHide).toBe(
				value,
			);
			const preferences = normalizeEditorPreferences({ cursorIdleHide: value });
			expect(
				normalizeEditorPreferences(JSON.parse(JSON.stringify(preferences))).cursorIdleHide,
			).toBe(value);
		}
		expect("cursorIdleHide" in normalizeProjectEditor({ cursorIdleHide: "yes" })).toBe(false);
	});

	it("does not let an older project's missing value overwrite the stored preference", () => {
		const stored = normalizeEditorPreferences({ cursorIdleHide: false });
		expect(
			normalizeEditorPreferences({ ...stored, cursorIdleHide: undefined }, stored)
				.cursorIdleHide,
		).toBe(false);
		const defaults = normalizeEditorPreferences({});
		expect(
			normalizeEditorPreferences({ ...defaults, cursorIdleHide: undefined }, defaults)
				.cursorIdleHide,
		).toBe(true);
	});

	it("saves the setting in new presets and leaves it out of presets that never had it", () => {
		const base = {
			...DEFAULT_EDITOR_PREFERENCES,
			cropRegion: DEFAULT_CROP_REGION,
			autoCaptionSettings: DEFAULT_AUTO_CAPTION_SETTINGS,
		};
		expect(
			JSON.parse(serializeEditorPresetSnapshot({ ...base, cursorIdleHide: false }))
				.cursorIdleHide,
		).toBe(false);
		const { cursorIdleHide: _omitted, ...legacy } = base;
		expect("cursorIdleHide" in JSON.parse(serializeEditorPresetSnapshot(legacy))).toBe(false);
	});
});
