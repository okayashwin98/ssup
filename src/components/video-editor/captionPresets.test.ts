import { describe, expect, it } from "vitest";
import { buildActiveCaptionLayout } from "./captionLayout";
import { applyCaptionPreset, getCaptionDisplayText, getCaptionPreset } from "./captionPresets";
import { buildExportRenderOptions } from "./export/buildExportRenderOptions";
import { normalizeExportPreferences } from "./exportPreferences";
import { resolveExportStartSettings, resolveShareExportSettings } from "./exportStartSettings";
import { normalizeProjectEditor } from "./projectPersistence";
import { type AutoCaptionSettings, type CaptionCue, DEFAULT_AUTO_CAPTION_SETTINGS } from "./types";

const cues: CaptionCue[] = [
	{
		id: "a",
		startMs: 1000,
		endMs: 3000,
		text: "Make it clear",
		words: [
			{ text: "Make", startMs: 1000, endMs: 1400 },
			{ text: "it", startMs: 1500, endMs: 1800, leadingSpace: true },
			{ text: "clear", startMs: 2000, endMs: 3000, leadingSpace: true },
		],
	},
];
const measureText = (text: string) => text.length * 10;

function layoutAt(timeMs: number, settings: AutoCaptionSettings) {
	return buildActiveCaptionLayout({ cues, timeMs, settings, maxWidthPx: 1000, measureText });
}

const enabled = { ...DEFAULT_AUTO_CAPTION_SETTINGS, enabled: true };

describe("caption styles", () => {
	it("Classic shows the whole caption with no reveal", () => {
		const layout = layoutAt(1100, enabled);
		expect(layout?.visibleLines[0].words.map((word) => word.text)).toEqual([
			"Make",
			"it",
			"clear",
		]);
		expect(
			layout?.visibleLines[0].words.every((word) => word.revealProgress === undefined),
		).toBe(true);
		expect(layout?.visibleLines[0].width).toBe(measureText("Make it clear"));
	});

	it("Reveal shows only the words already spoken, each fading in, and the box grows", () => {
		const reveal = applyCaptionPreset(enabled, "reveal");
		const first = layoutAt(1070, reveal);
		expect(first?.visibleLines[0].words.map((word) => word.text)).toEqual(["Make"]);
		expect(first?.visibleLines[0].words[0].revealProgress).toBeGreaterThan(0);
		expect(first?.visibleLines[0].words[0].revealProgress).toBeLessThan(1);
		expect(first?.visibleLines[0].width).toBe(measureText("Make"));

		const second = layoutAt(1600, reveal);
		expect(second?.visibleLines[0].words.map((word) => word.text)).toEqual(["Make", "it"]);
		expect(second?.visibleLines[0].words[0].revealProgress).toBe(1);
		expect(second?.visibleLines[0].width).toBe(measureText("Make it"));
		// Editing still offers the whole caption.
		expect(second?.editTarget.text).toBe("Make it clear");
	});

	it("TikTok measures and shows capitals but keeps the typed text", () => {
		const tiktok = applyCaptionPreset(enabled, "tiktok");
		const widths: string[] = [];
		buildActiveCaptionLayout({
			cues,
			timeMs: 1100,
			settings: tiktok,
			maxWidthPx: 1000,
			measureText: (text) => {
				widths.push(text);
				return text.length * 10;
			},
		});
		expect(widths.every((text) => text === text.toUpperCase())).toBe(true);
		expect(getCaptionDisplayText("Make it", "tiktok")).toBe("MAKE IT");
		expect(getCaptionPreset("tiktok").fontWeight).toBe(800);
	});

	it("switching style sets its look and Classic returns to the original look", () => {
		const reveal = applyCaptionPreset({ ...enabled, fontSize: 40 }, "reveal");
		expect(reveal).toMatchObject({ style: "reveal", fontSize: 40, boxRadius: 8 });
		const classic = applyCaptionPreset(reveal, "classic");
		expect(classic).toEqual({ ...enabled, fontSize: 40 });
		expect("style" in classic).toBe(false);
	});

	it("saved projects without a style open unchanged; Reveal and TikTok are kept", () => {
		const old = normalizeProjectEditor({ autoCaptionSettings: enabled });
		expect(old.autoCaptionSettings).toEqual(enabled);
		expect("style" in old.autoCaptionSettings).toBe(false);
		for (const style of ["reveal", "tiktok"] as const) {
			expect(
				normalizeProjectEditor({ autoCaptionSettings: { ...enabled, style } })
					.autoCaptionSettings.style,
			).toBe(style);
		}
		expect(
			"style" in
				normalizeProjectEditor({
					autoCaptionSettings: { ...enabled, style: "neon" as never },
				}).autoCaptionSettings,
		).toBe(false);
	});
});

describe("drawing captions into exports", () => {
	const build = (burnInCaptions: boolean | undefined, settings = enabled) =>
		buildExportRenderOptions({
			appearance: { hiddenTimelineLayers: [], webcam: {} } as never,
			timeline: { autoCaptions: cues, autoCaptionSettings: settings } as never,
			effectiveSpeedRegions: [],
			effectiveZoomRegions: [],
			effectiveCursorTelemetry: [],
			effectiveShowCursor: false,
			previewWidth: 1,
			previewHeight: 1,
			shadowIntensity: 0,
			burnInCaptions,
			onProgress: () => undefined,
		});

	it("is off by default: the renderers get no captions, exactly as before", () => {
		expect(build(undefined).autoCaptions).toEqual([]);
		expect(build(false).autoCaptions).toEqual([]);
		expect(normalizeExportPreferences({}).burnInCaptions).toBe(false);
	});

	it("when on, the renderers get the captions, unless captions are hidden", () => {
		expect(build(true).autoCaptions).toBe(cues);
		expect(build(true, { ...enabled, enabled: false }).autoCaptions).toEqual([]);
	});

	it("is remembered as an export preference and never applies to share links", () => {
		expect(normalizeExportPreferences({ burnInCaptions: true }).burnInCaptions).toBe(true);
		const options = {
			sourceWidth: 1920,
			sourceHeight: 1080,
			exportFormat: "mp4" as const,
			includeCaptionSidecar: false,
			exportEncodingMode: "balanced" as const,
			exportQuality: "good" as const,
			mp4FrameRate: 30 as const,
			exportBackendPreference: "auto" as const,
			exportPipelineModel: "modern" as const,
			gifFrameRate: 20 as const,
			gifLoop: true,
			gifSizePreset: "medium" as const,
		};
		expect("burnInCaptions" in resolveExportStartSettings(options)).toBe(false);
		const on = resolveExportStartSettings({ ...options, burnInCaptions: true });
		expect(on.burnInCaptions).toBe(true);
		expect("burnInCaptions" in resolveShareExportSettings(on)).toBe(false);
	});
});
