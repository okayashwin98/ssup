import { describe, expect, it } from "vitest";
import { getSquircleSvgPath } from "@/lib/geometry/squircle";
import { DEFAULT_EDITOR_PREFERENCES, serializeEditorPresetSnapshot } from "./editorPreferences";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";
import { DEFAULT_AUTO_CAPTION_SETTINGS, DEFAULT_CROP_REGION } from "./types";
import { getWebcamCornerRadiusPx } from "./webcamOverlay";
import {
	getWebcamShapeHeightPercent,
	getWebcamShapeRadiusPx,
	getWebcamShapeSvgPath,
} from "./webcamShape";

describe("webcam shape", () => {
	it("leaves a project saved before the choice without a shape, drawn exactly as before", () => {
		const editor = normalizeProjectEditor({ webcam: { roundness: 40 } as never });
		expect("shape" in editor.webcam).toBe(false);
		expect(JSON.stringify(createProjectData("/tmp/video.mp4", editor))).not.toContain(
			'"shape"',
		);
		const contour = { x: 0, y: 0, width: 200, height: 120, radius: 30 };
		expect(getWebcamShapeSvgPath(undefined, contour)).toBe(getSquircleSvgPath(contour));
		expect(getWebcamShapeRadiusPx({ roundness: 40 }, 100, 200, 120)).toBe(
			getWebcamCornerRadiusPx(40, 200, 120),
		);
		expect(getWebcamShapeHeightPercent(undefined, 40, 30)).toBe(30);
	});

	it("keeps a chosen shape through save and reload, and drops unknown values", () => {
		for (const shape of ["circle", "squircle", "rectangle"] as const) {
			const project = normalizeProjectEditor({ webcam: { shape } as never });
			expect(normalizeProjectEditor(JSON.parse(JSON.stringify(project))).webcam.shape).toBe(
				shape,
			);
		}
		expect(
			"shape" in normalizeProjectEditor({ webcam: { shape: "star" } as never }).webcam,
		).toBe(false);
	});

	it("makes a circle as tall as it is wide and ignores roundness", () => {
		expect(getWebcamShapeHeightPercent("circle", 40, 22)).toBe(40);
		expect(getWebcamShapeRadiusPx({ shape: "circle", roundness: 0 }, 100, 300, 300)).toBe(150);
		expect(
			getWebcamShapeSvgPath("circle", { x: 0, y: 0, width: 300, height: 300, radius: 150 }),
		).toContain("A 150 150");
	});

	it("rounds a rectangle with plain arcs sized by the roundness slider", () => {
		const radius = getWebcamShapeRadiusPx({ shape: "rectangle", roundness: 25 }, 100, 320, 180);
		expect(radius).toBe(getWebcamCornerRadiusPx(25, 320, 180));
		expect(
			getWebcamShapeSvgPath("rectangle", { x: 0, y: 0, width: 320, height: 180, radius }),
		).toContain(`A ${radius} ${radius}`);
	});

	it("saves the shape in new presets and leaves it out of presets that never had it", () => {
		const base = {
			...DEFAULT_EDITOR_PREFERENCES,
			cropRegion: DEFAULT_CROP_REGION,
			autoCaptionSettings: DEFAULT_AUTO_CAPTION_SETTINGS,
		};
		expect(
			JSON.parse(
				serializeEditorPresetSnapshot({
					...base,
					webcam: { ...base.webcam, shape: "circle" },
				}),
			).webcam.shape,
		).toBe("circle");
		expect("shape" in JSON.parse(serializeEditorPresetSnapshot(base)).webcam).toBe(false);
	});
});
