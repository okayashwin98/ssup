import {
	AppWindowIcon,
	ArrowClockwiseIcon,
	BoundingBox,
	House,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	MinusIcon,
	MonitorIcon,
	SpeakerHighIcon,
	SpeakerXIcon,
	TimerIcon,
	VideoCameraIcon,
	VideoCameraSlashIcon,
	XIcon,
} from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "../../contexts/I18nContext";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useVideoDevices } from "../../hooks/useVideoDevices";
import styles from "./HudBar.module.css";
import { useBarWindowSize } from "./hooks/useBarWindowSize";
import { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useLaunchWindowSystemState } from "./hooks/useLaunchWindowSystemState";
import { useMicLevel } from "./hooks/useMicLevel";
import { useRecordingTimer } from "./hooks/useRecordingTimer";
import { RecordingBarControls } from "./RecordingBar";

const COUNTDOWN_OPTIONS = [0, 3, 5, 10];
const SOURCE_MODES = [
	{ mode: "display" as const, label: "Display", name: "Record a display", Icon: MonitorIcon },
	{ mode: "window" as const, label: "Window", name: "Record a window", Icon: AppWindowIcon },
	{ mode: "area" as const, label: "Area", name: "Record an area", Icon: BoundingBox },
];
const WEBCAM_BUBBLE_STORAGE_KEY = "recordly.webcam-bubble-visible";

type MenuItem = Parameters<typeof window.electronAPI.hudShowMenu>[0]["items"][number];

/** Opens a native menu above or below the clicked bar item. */
function showMenuAt(event: MouseEvent<HTMLElement>, items: MenuItem[]) {
	const rect = event.currentTarget.getBoundingClientRect();
	return window.electronAPI.hudShowMenu({ items, x: rect.left, y: rect.top });
}

function readBubblePreference() {
	try {
		return localStorage.getItem(WEBCAM_BUBBLE_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

export function LaunchWindow() {
	const t = useScopedT("launch");
	const rootRef = useRef<HTMLDivElement>(null);
	const meterRef = useRef<HTMLSpanElement>(null);
	useBarWindowSize(rootRef);

	const {
		recording,
		paused,
		finalizing,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		cancelRecording,
		cancelRecordingStart,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId,
		countdownDelay,
		setCountdownDelay,
		preparePermissions,
	} = useScreenRecorder();

	const { elapsed } = useRecordingTimer(recording, paused);
	const { syncSelectedSource } = useLaunchWindowActions();
	const { devices, selectedDeviceId, setSelectedDeviceId } = useMicrophoneDevices(
		true,
		microphoneDeviceId,
	);
	const {
		devices: videoDevices,
		selectedDeviceId: selectedVideoDeviceId,
		setSelectedDeviceId: setSelectedVideoDeviceId,
	} = useVideoDevices(true);
	useLaunchWindowSystemState(preparePermissions);

	useEffect(() => {
		if (!selectedDeviceId) return;
		setMicrophoneDeviceId(selectedDeviceId === "default" ? undefined : selectedDeviceId);
	}, [selectedDeviceId, setMicrophoneDeviceId]);

	useEffect(() => {
		if (selectedVideoDeviceId && selectedVideoDeviceId !== "default") {
			setWebcamDeviceId(selectedVideoDeviceId);
		}
	}, [selectedVideoDeviceId, setWebcamDeviceId]);

	// The level line lets go of the microphone before a recording takes it.
	const [startRequested, setStartRequested] = useState(false);
	useMicLevel(
		meterRef,
		microphoneEnabled && !recording && !finalizing && !startRequested,
		microphoneDeviceId,
	);

	// The webcam bubble is its own window, shown while the webcam is on outside the editor.
	const [showBubble, setShowBubble] = useState(readBubblePreference);
	const [editorMode, setEditorMode] = useState(true);
	useEffect(() => {
		let active = true;
		let receivedEvent = false;
		const unsubscribe = window.electronAPI.onEditorModeChanged((inEditor) => {
			receivedEvent = true;
			if (active) setEditorMode(inEditor);
		});
		void window.electronAPI
			.getEditorMode()
			.then((inEditor) => {
				if (active && !receivedEvent) setEditorMode(inEditor);
			})
			.catch(() => {
				/* Keep the camera off if editor mode is unknown. */
			});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);
	useEffect(() => {
		window.electronAPI.hudSetWebcamBubble({
			visible: webcamEnabled && showBubble && !editorMode,
			deviceId: webcamDeviceId,
		});
	}, [webcamEnabled, showBubble, editorMode, webcamDeviceId]);
	useEffect(() => () => window.electronAPI.hudSetWebcamBubble({ visible: false }), []);

	// The recording bar is another window: send it the time, and take its commands.
	useEffect(() => {
		if (recording) window.electronAPI.hudPublishRecordingStatus({ paused, elapsed });
	}, [recording, paused, elapsed]);
	const commandHandlers = useRef({
		toggleRecording,
		pauseRecording,
		resumeRecording,
		cancelRecording,
	});
	commandHandlers.current = { toggleRecording, pauseRecording, resumeRecording, cancelRecording };
	const recordingRef = useRef(recording);
	recordingRef.current = recording;
	useEffect(
		() =>
			window.electronAPI.onRecordingControlsCommand((command) => {
				if (!recordingRef.current) return;
				const handlers = commandHandlers.current;
				if (command === "stop") void handlers.toggleRecording();
				else if (command === "pause") void handlers.pauseRecording();
				else if (command === "resume") void handlers.resumeRecording();
				else if (command === "cancel") void handlers.cancelRecording();
			}),
		[],
	);

	const startRecordingRef = useRef(toggleRecording);
	startRecordingRef.current = toggleRecording;
	const pickerPending = useRef(false);
	const [pickerMode, setPickerMode] = useState<CapturePickerMode | null>(null);
	const [sourceReady, setSourceReady] = useState(false);
	// Screen Studio's Display, Window and Area: each opens the picker for that kind of target.
	const handlePickOnScreen = useCallback(
		async (mode: CapturePickerMode) => {
			if (pickerPending.current || recording || finalizing) return;
			pickerPending.current = true;
			setPickerMode(mode);
			try {
				if (!(await cancelRecordingStart())) return;
				if (!(await preparePermissions())) return;
				const result = await window.electronAPI.pickCaptureTarget(mode);
				if (result.success && result.source) syncSelectedSource(result.source);
				// "Start recording" on the picked window, screen or area.
				if (result.success && result.record) {
					setStartRequested(true);
					void Promise.resolve(startRecordingRef.current()).finally(() =>
						setStartRequested(false),
					);
				}
				if (result.message && !result.canceled) {
					if (result.success) toast.info(result.message);
					else toast.error(result.message);
				}
			} catch {
				toast.error("Unable to open the source picker.");
			} finally {
				pickerPending.current = false;
				setPickerMode(null);
			}
		},
		[recording, cancelRecordingStart, preparePermissions, finalizing, syncSelectedSource],
	);

	useEffect(() => {
		let mounted = true;
		let selectionEventSeen = false;
		void window.electronAPI
			.getSelectedSource()
			.then((source) => {
				if (mounted) setSourceReady(true);
				if (mounted && !selectionEventSeen) syncSelectedSource(source);
			})
			.catch(() => {
				if (mounted) {
					setSourceReady(true);
					toast.error("Unable to load the recording source. Pick a screen again.");
				}
			});
		const cleanup = window.electronAPI.onSelectedSourceChanged((source) => {
			selectionEventSeen = true;
			if (mounted) syncSelectedSource(source);
		});
		return () => {
			mounted = false;
			cleanup?.();
		};
	}, [syncSelectedSource]);

	const openHome = () => {
		localStorage.setItem("recordly.open-dashboard", String(Date.now()));
		void window.electronAPI.showProjectDashboard();
	};

	const microphoneLabel =
		devices.find((device) => device.deviceId === selectedDeviceId)?.label ||
		t("recording.microphone");
	const cameraLabel =
		videoDevices.find((device) => device.deviceId === selectedVideoDeviceId)?.label ||
		t("recording.webcam");

	const openMicrophoneMenu = async (event: MouseEvent<HTMLElement>) => {
		const choice = await showMenuAt(event, [
			{ type: "header", label: t("recording.microphone") },
			...devices.map((device) => ({
				id: `device:${device.deviceId}`,
				label: device.label,
				type: "radio" as const,
				checked: microphoneEnabled && device.deviceId === selectedDeviceId,
			})),
			{ type: "separator" },
			{
				id: "off",
				label: t("recording.noMicrophone", "No microphone"),
				type: "radio",
				checked: !microphoneEnabled,
			},
		]);
		if (choice === "off") setMicrophoneEnabled(false);
		else if (choice?.startsWith("device:")) {
			const deviceId = choice.slice("device:".length);
			setMicrophoneEnabled(true);
			setSelectedDeviceId(deviceId);
			setMicrophoneDeviceId(deviceId === "default" ? undefined : deviceId);
		}
	};

	const openCameraMenu = async (event: MouseEvent<HTMLElement>) => {
		const choice = await showMenuAt(event, [
			{ type: "header", label: t("recording.webcam") },
			...videoDevices.map((device) => ({
				id: `device:${device.deviceId}`,
				label: device.label,
				type: "radio" as const,
				checked: webcamEnabled && device.deviceId === selectedVideoDeviceId,
			})),
			{ type: "separator" },
			{
				id: "off",
				label: t("recording.noCamera", "No camera"),
				type: "radio",
				checked: !webcamEnabled,
			},
			{ type: "separator" },
			{
				id: "bubble",
				label: t("recording.showFloatingWebcamPreview"),
				type: "checkbox",
				checked: showBubble,
				enabled: webcamEnabled,
			},
		]);
		if (choice === "off") setWebcamEnabled(false);
		else if (choice === "bubble") {
			const next = !showBubble;
			setShowBubble(next);
			try {
				localStorage.setItem(WEBCAM_BUBBLE_STORAGE_KEY, String(next));
			} catch {
				// Remembering the choice is a convenience.
			}
		} else if (choice?.startsWith("device:")) {
			const deviceId = choice.slice("device:".length);
			setWebcamEnabled(true);
			setSelectedVideoDeviceId(deviceId);
			setWebcamDeviceId(deviceId);
		}
	};

	const openCountdownMenu = async (event: MouseEvent<HTMLElement>) => {
		const choice = await showMenuAt(event, [
			{ type: "header", label: t("recording.countdownDelay") },
			...COUNTDOWN_OPTIONS.map((delay) => ({
				id: String(delay),
				label: delay === 0 ? t("recording.noDelay") : `${delay}s`,
				type: "radio" as const,
				checked: countdownDelay === delay,
			})),
		]);
		if (choice !== null) setCountdownDelay(Number(choice));
	};

	let content;
	if (finalizing) {
		content = (
			<div className={styles.preparing}>
				<ArrowClockwiseIcon className={`${styles.icon} ${styles.spin}`} />
				{t("recording.preparing", "Preparing recording")}
			</div>
		);
	} else if (recording) {
		// Normally hidden while the recording bar shows; kept usable if it is ever revealed.
		content = (
			<RecordingBarControls
				paused={paused}
				elapsed={elapsed}
				onStop={() => void toggleRecording()}
				onPauseResume={() => void (paused ? resumeRecording() : pauseRecording())}
				onCancel={() => void cancelRecording()}
				onHide={() => window.electronAPI.hudOverlayHide()}
			/>
		);
	} else {
		content = (
			<>
				<button
					type="button"
					className={styles.close}
					onClick={() => window.electronAPI.hudOverlayClose()}
					title={t("recording.closeApp")}
					aria-label={t("recording.closeApp")}
				>
					<XIcon weight="bold" className="size-4" />
				</button>
				<span className={styles.divider} />
				{SOURCE_MODES.map(({ mode, label, name, Icon }) => (
					<button
						key={mode}
						type="button"
						className={`${styles.item} ${styles.mode}`}
						data-active={pickerMode === mode || undefined}
						aria-label={name}
						disabled={(pickerMode !== null && pickerMode !== mode) || !sourceReady}
						onClick={() => void handlePickOnScreen(mode)}
					>
						<Icon className={styles.icon} />
						<span>{label}</span>
					</button>
				))}
				<span className={styles.divider} />
				<button
					type="button"
					className={styles.item}
					data-off={!webcamEnabled || undefined}
					title={t("recording.webcam")}
					onClick={(event) => void openCameraMenu(event)}
				>
					{webcamEnabled ? (
						<VideoCameraIcon weight="fill" className={styles.icon} />
					) : (
						<VideoCameraSlashIcon className={styles.icon} />
					)}
					<span className={styles.label}>
						{webcamEnabled ? cameraLabel : t("recording.noCamera", "No camera")}
					</span>
				</button>
				<button
					type="button"
					className={styles.item}
					data-off={!microphoneEnabled || undefined}
					title={t("recording.microphone")}
					onClick={(event) => void openMicrophoneMenu(event)}
				>
					{microphoneEnabled ? (
						<MicrophoneIcon weight="fill" className={styles.icon} />
					) : (
						<MicrophoneSlashIcon className={styles.icon} />
					)}
					<span className={styles.label}>
						{microphoneEnabled
							? microphoneLabel
							: t("recording.noMicrophone", "No microphone")}
					</span>
					{microphoneEnabled && (
						<span className={styles.meter}>
							<span ref={meterRef} className={styles.meterFill} />
						</span>
					)}
				</button>
				<button
					type="button"
					className={styles.item}
					data-off={!systemAudioEnabled || undefined}
					title={
						systemAudioEnabled
							? t("recording.disableSystemAudio")
							: t("recording.enableSystemAudio")
					}
					onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
				>
					{systemAudioEnabled ? (
						<SpeakerHighIcon weight="fill" className={styles.icon} />
					) : (
						<SpeakerXIcon className={styles.icon} />
					)}
					<span className={styles.label}>
						{systemAudioEnabled
							? t("recording.systemAudio", "System audio")
							: t("recording.noSystemAudio", "No system audio")}
					</span>
				</button>
				<button
					type="button"
					className={styles.item}
					data-off={countdownDelay === 0 || undefined}
					title={t("recording.countdownDelay")}
					onClick={(event) => void openCountdownMenu(event)}
				>
					<TimerIcon className={styles.icon} />
					<span className={styles.label}>
						{countdownDelay === 0 ? t("recording.noDelay") : `${countdownDelay}s`}
					</span>
				</button>
				<span className={styles.divider} />
				<button
					type="button"
					className={`${styles.item} ${styles.iconOnly}`}
					onClick={openHome}
					title={t("recording.home")}
					aria-label={t("recording.home")}
				>
					<House className={styles.icon} />
				</button>
				<button
					type="button"
					className={`${styles.item} ${styles.iconOnly}`}
					onClick={() => window.electronAPI.hudOverlayHide()}
					title={t("recording.hideHud")}
					aria-label={t("recording.hideHud")}
				>
					<MinusIcon className={styles.icon} />
				</button>
			</>
		);
	}

	return (
		<div ref={rootRef} className={styles.root}>
			<div className={styles.bar}>{content}</div>
		</div>
	);
}
