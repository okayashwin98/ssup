import { type RefObject, useEffect } from "react";

const FRAME_INTERVAL_MS = 1000 / 20;

/**
 * Draws the microphone's level into a bar's width, about 20 times a second,
 * without re-rendering React. Runs only while `active`.
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
		let timer: number | null = null;

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
				analyser.fftSize = 512;
				context.createMediaStreamSource(stream).connect(analyser);
				const samples = new Float32Array(analyser.fftSize);
				timer = window.setInterval(() => {
					analyser.getFloatTimeDomainData(samples);
					let sum = 0;
					for (const sample of samples) sum += sample * sample;
					const rms = Math.sqrt(sum / samples.length);
					// Speech sits around -40 to -10 dBFS; map that range onto the bar.
					const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 50) / 40));
					if (fillRef.current)
						fillRef.current.style.width = `${Math.round(level * 100)}%`;
				}, FRAME_INTERVAL_MS);
			} catch (error) {
				console.warn("Microphone level unavailable:", error);
			}
		};
		void start();

		return () => {
			cancelled = true;
			if (timer !== null) window.clearInterval(timer);
			stream?.getTracks().forEach((track) => track.stop());
			void context?.close();
			if (fillRef.current) fillRef.current.style.width = "0%";
		};
	}, [active, deviceId, fillRef]);
}
