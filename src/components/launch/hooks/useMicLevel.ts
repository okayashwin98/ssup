import { type RefObject, useEffect } from "react";

// Quiet room sound (a typical Mac mic idles near -55 dB) only ripples the bar a little;
// from QUIET_DB up, speech moves it properly, and loud speech fills it.
const SILENT_DB = -64;
const QUIET_DB = -46;
const QUIET_SHARE = 0.15;
const CEILING_DB = -10;

function levelFor(db: number) {
	if (db <= SILENT_DB) return 0;
	if (db < QUIET_DB) return (QUIET_SHARE * (db - SILENT_DB)) / (QUIET_DB - SILENT_DB);
	return Math.min(
		1,
		QUIET_SHARE + ((1 - QUIET_SHARE) * (db - QUIET_DB)) / (CEILING_DB - QUIET_DB),
	);
}
// The bar jumps up quickly and sinks slowly, like a VU meter.
const RISE_MS = 50;
const FALL_MS = 320;
// While the microphone is on, the bar never fully empties, as in Screen Studio.
const RESTING = 0.12;

/**
 * Draws the microphone's level into a bar on every screen frame, eased so it
 * glides instead of jumping, without re-rendering React. Runs only while `active`.
 */
export function useMicLevel(
	fillRef: RefObject<HTMLElement | null>,
	active: boolean,
	deviceId?: string,
) {
	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		let stream: MediaStream | null = null;
		let context: AudioContext | null = null;
		let frame: number | null = null;

		const draw = (level: number) => {
			if (fillRef.current) fillRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
		};

		const start = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: deviceId ? { deviceId: { exact: deviceId } } : true,
					video: false,
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}
				context = new AudioContext();
				const analyser = context.createAnalyser();
				analyser.fftSize = 1024;
				context.createMediaStreamSource(stream).connect(analyser);
				const samples = new Float32Array(analyser.fftSize);
				const showLevel = (level: number) => draw(RESTING + (1 - RESTING) * level);
				let shown = 0;
				let drawn = -1;
				let last = performance.now();
				const tick = (now: number) => {
					const elapsed = Math.min(100, now - last);
					last = now;
					analyser.getFloatTimeDomainData(samples);
					let sum = 0;
					for (const sample of samples) sum += sample * sample;
					const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-8);
					const target = levelFor(db);
					const ease = 1 - Math.exp(-elapsed / (target > shown ? RISE_MS : FALL_MS));
					shown += (target - shown) * ease;
					if (shown < 0.002) shown = 0;
					// Skip repaints while the bar is still.
					if (Math.abs(shown - drawn) > 0.002) {
						showLevel(shown);
						drawn = shown;
					}
					frame = requestAnimationFrame(tick);
				};
				frame = requestAnimationFrame(tick);
			} catch (error) {
				console.warn("Microphone level unavailable:", error);
			}
		};
		void start();

		return () => {
			cancelled = true;
			if (frame !== null) cancelAnimationFrame(frame);
			stream?.getTracks().forEach((track) => track.stop());
			void context?.close();
			draw(0);
		};
	}, [active, deviceId, fillRef]);
}
