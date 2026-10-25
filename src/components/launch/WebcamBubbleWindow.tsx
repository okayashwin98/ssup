import { useEffect, useRef, useState } from "react";
import styles from "./HudBar.module.css";

/** The floating webcam bubble: its own window, dragged and resized like any window. */
export default function WebcamBubbleWindow() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [deviceId, setDeviceId] = useState<string | null | undefined>(undefined);

	useEffect(() => {
		let active = true;
		const unsubscribe = window.electronAPI.onWebcamBubbleDeviceChanged((next) => {
			if (active) setDeviceId(next);
		});
		void window.electronAPI.webcamBubbleGetDevice().then((initial) => {
			if (active) setDeviceId((current) => (current === undefined ? initial : current));
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		if (deviceId === undefined) return;
		let cancelled = false;
		let stream: MediaStream | null = null;
		const size = { ideal: 320 };
		void navigator.mediaDevices
			.getUserMedia({
				video: {
					...(deviceId ? { deviceId: { exact: deviceId } } : {}),
					width: size,
					height: size,
					frameRate: { ideal: 24, max: 30 },
				},
				audio: false,
			})
			.then((next) => {
				if (cancelled) {
					next.getTracks().forEach((track) => track.stop());
					return;
				}
				stream = next;
				if (videoRef.current) {
					videoRef.current.srcObject = next;
					void videoRef.current.play().catch(() => undefined);
				}
			})
			.catch((error) => console.warn("Webcam bubble unavailable:", error));
		return () => {
			cancelled = true;
			if (videoRef.current) videoRef.current.srcObject = null;
			stream?.getTracks().forEach((track) => track.stop());
		};
	}, [deviceId]);

	return (
		<div className={styles.bubble}>
			<video ref={videoRef} className={styles.bubbleVideo} muted playsInline />
		</div>
	);
}
