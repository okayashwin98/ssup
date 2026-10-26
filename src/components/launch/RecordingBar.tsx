import { useEffect, useRef, useState } from "react";
import { MinusIcon, PauseIcon, PlayIcon, XIcon } from "@/components/ui/icons";
import { useScopedT } from "../../contexts/I18nContext";
import styles from "./HudBar.module.css";
import { useBarDrag } from "./hooks/useBarDrag";
import { useBarWindowSize } from "./hooks/useBarWindowSize";
import { useWindowGlass } from "./hooks/useWindowGlass";

function formatElapsed(seconds: number) {
	const minutes = Math.floor(seconds / 60)
		.toString()
		.padStart(2, "0");
	return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export interface RecordingBarControlsProps {
	paused: boolean;
	elapsed: number;
	onStop: () => void;
	onPauseResume: () => void;
	onCancel: () => void;
	onHide: () => void;
}

/** Stop, time, pause and discard: the bar shown while a recording runs. */
export function RecordingBarControls({
	paused,
	elapsed,
	onStop,
	onPauseResume,
	onCancel,
	onHide,
}: RecordingBarControlsProps) {
	const t = useScopedT("launch");
	return (
		<>
			<button
				type="button"
				className={styles.stop}
				onClick={onStop}
				title={t("recording.stop")}
				aria-label={t("recording.stop")}
			>
				<span className={styles.stopSquare} />
			</button>
			<div
				className={styles.timer}
				role="status"
				aria-label={paused ? t("recording.paused") : t("recording.rec")}
			>
				<span className={styles.timerDot} data-paused={paused || undefined} />
				{formatElapsed(elapsed)}
			</div>
			<span className={styles.divider} />
			<button
				type="button"
				className={`${styles.item} ${styles.iconOnly}`}
				onClick={onPauseResume}
				title={paused ? t("recording.resume") : t("recording.pause")}
				aria-label={paused ? t("recording.resume") : t("recording.pause")}
			>
				{paused ? (
					<PlayIcon weight="fill" className={styles.icon} />
				) : (
					<PauseIcon weight="fill" className={styles.icon} />
				)}
			</button>
			<button
				type="button"
				className={`${styles.item} ${styles.iconOnly}`}
				onClick={onCancel}
				title={t("recording.cancel")}
				aria-label={t("recording.cancel")}
			>
				<XIcon className={styles.icon} />
			</button>
			<button
				type="button"
				className={`${styles.item} ${styles.iconOnly}`}
				onClick={onHide}
				title={t("recording.hideHud")}
				aria-label={t("recording.hideHud")}
			>
				<MinusIcon className={styles.icon} />
			</button>
		</>
	);
}

const dragRecordingBar = (phase: "start" | "move" | "end", screenX: number, screenY: number) =>
	window.electronAPI.recordingControlsDrag(phase, screenX, screenY);

/** The recording bar window; the start bar's window keeps the recorder and takes its commands. */
export default function RecordingBarWindow() {
	const rootRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState({ paused: false, elapsed: 0 });
	useBarWindowSize(rootRef);
	const onGlass = useWindowGlass();
	useBarDrag(rootRef, dragRecordingBar);

	useEffect(() => {
		let active = true;
		const unsubscribe = window.electronAPI.onRecordingControlsStatus((next) => {
			if (active) setStatus(next);
		});
		void window.electronAPI.getRecordingControlsStatus().then((initial) => {
			if (active) setStatus(initial);
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	const send = window.electronAPI.sendRecordingControlsCommand;
	return (
		<div ref={rootRef} className={styles.root}>
			<div
				className={`${styles.bar} ${styles.compact}${onGlass ? ` ${styles.onGlass}` : ""}`}
				role="group"
				aria-label="Recording controls"
			>
				<RecordingBarControls
					paused={status.paused}
					elapsed={status.elapsed}
					onStop={() => send("stop")}
					onPauseResume={() => send(status.paused ? "resume" : "pause")}
					onCancel={() => send("cancel")}
					onHide={() => send("hide")}
				/>
			</div>
		</div>
	);
}
