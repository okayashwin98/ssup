import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const recorderSource = readFileSync(
	fileURLToPath(new URL("./ScreenCaptureKitRecorder.swift", import.meta.url)),
	"utf8",
);

describe("ScreenCaptureKitRecorder finalization coordination", () => {
	it("finalizes on parent pipe closure as well as an explicit stop, exactly once", () => {
		const commandLoop = recorderSource.slice(
			recorderSource.indexOf("while let input = readLine"),
		);
		expect(commandLoop).toMatch(
			/if input == "stop"\s*\{\s*break\s*\}\s*\}\s*\/\/.*?service\.stop\(\)/s,
		);
		expect(commandLoop.match(/service\.stop\(\)/g)).toHaveLength(1);
	});

	it("marks manual stops as participants in the shared finalization", () => {
		expect(recorderSource).toContain("finalizeCapture(interactive: true)");
		expect(recorderSource).toContain("finalization.outputResult.get()");
		expect(recorderSource).toContain(
			"self.interactiveStopParticipated = self.interactiveStopParticipated || interactive",
		);
	});

	it("does not let automatic window-close exit preempt a joined manual stop", () => {
		expect(recorderSource).toContain("self.finalizeCapture(interactive: false)");
		expect(recorderSource).toMatch(
			/if finalization\.interactiveStopParticipated\s*\{\s*return\s*\}/,
		);
	});
});

describe("ScreenCaptureKitRecorder resume timing", () => {
	it("anchors warm-start resume timing to video before accepting audio", () => {
		expect(recorderSource).toContain(
			"guard outputType == .screen, let pauseStartedHostTime else",
		);
	});

	it("drops non-monotonic video and audio samples", () => {
		expect(recorderSource).toContain(
			"CMTimeCompare(presentationTime, lastVideoPresentationTime) <= 0",
		);
		expect(recorderSource).toContain(
			"CMTimeCompare(presentationTime, lastPresentationTime) > 0",
		);
	});
});

describe("ScreenCaptureKitRecorder colour metadata", () => {
	it("asks ScreenCaptureKit for BT.709-compatible video-range frames", () => {
		expect(recorderSource).toContain(
			"streamConfig.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange",
		);
		expect(recorderSource).toContain("streamConfig.colorSpaceName = CGColorSpace.sRGB");
		expect(recorderSource).toContain(
			"streamConfig.colorMatrix = CGDisplayStream.yCbCrMatrix_ITU_R_709_2",
		);
		expect(recorderSource).toContain("kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange");
		expect(recorderSource).toContain("sourceFormatHint: sourceVideoFormat");
		expect(recorderSource).not.toContain("videoCodecType: .h264");
	});

	it("tags recordings as BT.709", () => {
		expect(recorderSource).toContain("AVVideoColorPropertiesKey");
		expect(recorderSource).toContain("AVVideoColorPrimaries_ITU_R_709_2");
		expect(recorderSource).toContain("AVVideoTransferFunction_ITU_R_709_2");
		expect(recorderSource).toContain("AVVideoYCbCrMatrix_ITU_R_709_2");
	});
});

describe("ScreenCaptureKitRecorder window capture", () => {
	it("asks macOS for only the selected part of the display", () => {
		expect(recorderSource).toContain("streamConfig.sourceRect = crop.rect");
		expect(recorderSource).not.toContain("desktopIndependentWindow");
		expect(recorderSource).not.toContain("CIImage");
		expect(recorderSource).toContain(
			"requestedFrame = CGRect(x: x, y: y, width: width, height: height)",
		);
		expect(recorderSource).toContain(
			"let captureRect = visibleFrame.intersection(display.frame)",
		);
	});

	it("records whole, even pixel sizes and sizes the bitrate for the frame rate", () => {
		expect(recorderSource).toContain(
			"let crop = Self.pixelCrop(for: captureRect, on: display, scale: scaleFactor)",
		);
		expect(recorderSource).toMatch(/let width = max\(2, Int\(.*\) & ~1\)/);
		expect(recorderSource).toContain("x: left / pixelsPerPoint,");
		expect(recorderSource).toContain("averageBitRate * requestedFPS / assistantFPS");
		expect(recorderSource).toContain(
			"compression[AVVideoMaxKeyFrameIntervalKey] = requestedFPS",
		);
	});

	it("records a fixed area of a display through the same crop", () => {
		expect(recorderSource).toContain("let regionX: Double?");
		expect(recorderSource).toContain("} else if let x = config.regionX,");
	});

	it("refreshes the crop and capture display while the window moves or resizes", () => {
		expect(recorderSource).toContain(
			"guard let display = Self.captureDisplay(for: window.frame",
		);
		expect(recorderSource).toContain("try await activeStream.updateContentFilter(filter)");
		expect(recorderSource).toContain(
			"try await activeStream.updateConfiguration(configuration)",
		);
		expect(recorderSource).toContain("self.windowSourceRect = sourceRect");
	});
});

describe("ScreenCaptureKitRecorder first frame timing", () => {
	const callback = recorderSource.slice(
		recorderSource.indexOf("func stream(_ stream:"),
		recorderSource.indexOf("func stream(_ stream:") + 5000,
	);
	it("validates a complete frame and writer readiness before setting time zero", () => {
		const clock = callback.indexOf("adjustedPresentationTime(for:");
		expect(clock).toBeGreaterThan(callback.indexOf("status == .complete"));
		expect(clock).toBeGreaterThan(callback.indexOf("videoInput.isReadyForMoreMediaData"));
	});
	it("resets the origin after a rejected first frame and gates audio on accepted video", () => {
		expect(callback).toMatch(/else if frameCount == 0\s*\{[^}]*firstSampleTime = \.zero/);
		const audioGuard = callback.indexOf("guard frameCount > 0,");
		expect(audioGuard).toBeGreaterThan(0);
		expect(audioGuard).toBeLessThan(callback.indexOf("if outputType == .audio"));
	});
});

describe("ScreenCaptureKitRecorder pause timing", () => {
	it("ends a pause at resume rather than at the next delivered frame", () => {
		expect(recorderSource).toContain(
			"self.resumeHostTime = CMClockGetTime(CMClockGetHostTimeClock())",
		);
		expect(recorderSource).toContain(
			"let pauseGap = (resumeHostTime ?? sampleTime) - pauseStartedHostTime",
		);
		expect(recorderSource).toContain('"Recording resumed at %.3f"');
	});
});
