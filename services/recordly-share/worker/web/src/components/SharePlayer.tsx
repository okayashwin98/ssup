// Adapted from Voom (MIT), Copyright (c) 2026 Aritro Paul.
// See ../../../LICENSE and ../../../../../THIRD_PARTY_NOTICES.md.
import { Button, Card, Dropdown, Label, Link, Slider, Tooltip, toast } from "@heroui/react";
import {
	ArrowCounterClockwiseIcon,
	ArrowsOutSimpleIcon,
	ChatCircleIcon,
	ClockClockwiseIcon,
	ClockCounterClockwiseIcon,
	ClosedCaptioningIcon,
	GearSixIcon,
	PauseIcon,
	PictureInPictureIcon,
	PlayIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
} from "@phosphor-icons/react";
import {
	type CSSProperties,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { Comment, Reaction, ShareData } from "../scripts/api";
import { formatDate, formatTimestamp } from "../scripts/api";

// Shared recordings start at 1.5×; viewers can change it from the speed menu.
const DEFAULT_SPEED = 1.5;

function formatCoverDuration(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	const total = Math.max(1, Math.round(seconds));
	return total < 60 ? `${total}s` : formatTimestamp(total);
}

import { clusterTimeline, type TimelineItem } from "../scripts/shareModel";
import { Spinner } from "./ShareUI";

interface Props {
	data: ShareData;
	videoRef: RefObject<HTMLVideoElement | null>;
	comments: Comment[];
	reactions: Reaction[];
	time: number;
	duration: number;
	onTime: (time: number) => void;
	onDuration: (duration: number) => void;
	seek: (time: number) => void;
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

/** The playback speed menu: the "1.5×" button on desktop, a gear on phones. */
/** Speed choices; given `captions`, a Subtitles on/off row sits above them (phones). */
function SpeedMenu({
	speed,
	onSpeed,
	onOpenChange,
	trigger,
	captions,
}: {
	speed: number;
	onSpeed: (rate: number) => void;
	onOpenChange: (open: boolean) => void;
	trigger: ReactNode;
	captions?: { on: boolean; toggle: () => void };
}) {
	const speeds = SPEEDS.map((rate) => (
		<Dropdown.Item key={rate} id={String(rate)} textValue={`${rate}×`}>
			<Label>{rate}×</Label>
			<Dropdown.ItemIndicator />
		</Dropdown.Item>
	));
	return (
		<Dropdown onOpenChange={onOpenChange}>
			{trigger}
			<Dropdown.Popover className={`speed-menu${captions ? " settings-menu" : ""}`}>
				<Dropdown.Menu
					aria-label={captions ? "Player settings" : "Playback speed"}
					selectionMode="single"
					selectedKeys={new Set([String(speed)])}
					onAction={(key) =>
						key === "captions" ? captions?.toggle() : onSpeed(Number(key))
					}
				>
					{captions ? (
						<>
							<Dropdown.Section aria-label="Subtitles">
								<Dropdown.Item id="captions" textValue="Subtitles">
									{/* Never ticked; it keeps the label in line with the speeds below. */}
									<Dropdown.ItemIndicator />
									<Label>Subtitles</Label>
									<span className="menu-value">{captions.on ? "On" : "Off"}</span>
								</Dropdown.Item>
							</Dropdown.Section>
							<Dropdown.Section aria-label="Playback speed">
								{speeds}
							</Dropdown.Section>
						</>
					) : (
						speeds
					)}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}

export default function SharePlayer({
	data,
	videoRef,
	comments,
	reactions,
	time,
	duration,
	onTime,
	onDuration,
	seek,
}: Props) {
	const shell = useRef<HTMLDivElement>(null);
	// Shape the player like the recording so no letterbox bars appear.
	const [videoRatio, setVideoRatio] = useState(() =>
		data.video.width > 0 && data.video.height > 0 ? data.video.width / data.video.height : null,
	);
	// Controls sit over the video and fade out while playing with the pointer still.
	const [pointerActive, setPointerActive] = useState(false);
	// Off the player nothing is drawn over the video, so screenshots stay clean.
	const [pointerInside, setPointerInside] = useState(false);
	const idleTimer = useRef<number | undefined>(undefined);
	const wakeControls = useCallback(() => {
		setPointerInside(true);
		setPointerActive(true);
		window.clearTimeout(idleTimer.current);
		idleTimer.current = window.setTimeout(() => setPointerActive(false), 2500);
	}, []);
	useEffect(() => () => window.clearTimeout(idleTimer.current), []);
	// On the phone layout a tap on the video only shows or hides the controls; the
	// centre buttons play and pause. These remember the tap until its click arrives.
	const tapIsPhoneTouch = useRef(false);
	const tapStartedShown = useRef(false);
	const [poster, setPoster] = useState<string>();
	useEffect(() => {
		let active = true;
		setPoster(undefined);
		const image = new Image();
		const url = `/thumb/${data.shareCode}`;
		image.onload = () => {
			if (active) setPoster(url);
		};
		// A missing poster must not obscure the video element's decoded first frame.
		image.onerror = () => {
			if (active) setPoster(undefined);
		};
		image.src = url;
		return () => {
			active = false;
			image.onload = null;
			image.onerror = null;
		};
	}, [data.shareCode]);
	const markers = useRef<HTMLDivElement>(null);
	const [trackWidth, setTrackWidth] = useState(500);
	const [playing, setPlaying] = useState(false);
	// The title cover shows until the viewer first presses play.
	const [started, setStarted] = useState(false);
	const [waiting, setWaiting] = useState(false);
	const [ended, setEnded] = useState(false);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [speed, setSpeed] = useState(DEFAULT_SPEED);
	// Subtitles start off; viewers turn them on with the CC button.
	const [captions, setCaptions] = useState(false);
	const [pip, setPip] = useState(false);
	const [error, setError] = useState(false);
	const savedVolume = useRef(1);
	// The speed menu opens outside the player, so it keeps the controls up itself.
	const [menuOpen, setMenuOpen] = useState(false);
	const controlsShown = started && (menuOpen || (pointerInside && (!playing || pointerActive)));
	// Read by the tap handler, which can run before the player re-renders.
	const controlsShownNow = useRef(controlsShown);
	controlsShownNow.current = controlsShown;
	// The seek bar is painted every frame while playing; timeupdate alone only
	// fires a few times a second and makes it tick.
	const seekFill = useRef<HTMLDivElement>(null);
	const paintProgress = useCallback(
		(current: number) => {
			const fill = seekFill.current;
			if (!fill) return;
			const length = videoRef.current?.duration;
			const total = length && Number.isFinite(length) ? length : duration;
			fill.style.width = total
				? `${Math.min(100, Math.max(0, (current / total) * 100))}%`
				: "0%";
		},
		[duration, videoRef],
	);
	useLayoutEffect(() => {
		if (!playing) paintProgress(time);
	}, [playing, time, paintProgress]);
	useEffect(() => {
		if (!playing) return;
		let frame = 0;
		const tick = () => {
			const video = videoRef.current;
			if (video) paintProgress(video.currentTime);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, paintProgress, videoRef]);
	const caption = data.segments.find((s) => time >= s.start_time && time < s.end_time);
	const cta =
		data.video.cta_url && /^https?:\/\//i.test(data.video.cta_url) ? data.video.cta_url : null;

	const togglePlay = useCallback(async () => {
		const video = videoRef.current;
		if (!video) return;
		if (!video.paused) video.pause();
		else
			try {
				await video.play();
			} catch {
				toast.danger("Playback could not start. Try again.");
			}
	}, [videoRef]);
	const setRate = useCallback(
		(rate: number) => {
			if (videoRef.current) videoRef.current.playbackRate = rate;
		},
		[videoRef],
	);
	const toggleMute = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		if (video.muted || video.volume === 0) {
			video.muted = false;
			video.volume = savedVolume.current || 1;
		} else {
			savedVolume.current = video.volume;
			video.muted = true;
		}
	}, [videoRef]);
	const fullscreen = useCallback(async () => {
		const page = document as Document & {
			webkitFullscreenElement?: Element | null;
			webkitExitFullscreen?: () => void;
		};
		const player = shell.current as
			| (HTMLDivElement & { webkitRequestFullscreen?: () => void })
			| null;
		const video = videoRef.current as
			| (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
			| null;
		try {
			if (document.fullscreenElement) return await document.exitFullscreen();
			if (page.webkitFullscreenElement) return page.webkitExitFullscreen?.();
			if (player?.requestFullscreen) return await player.requestFullscreen();
			if (player?.webkitRequestFullscreen) return player.webkitRequestFullscreen();
		} catch {
			/* Falls back to the phone's own player below. */
		}
		// iPhones can only show the video itself full screen, in their own player, which draws
		// the subtitles; it gets the viewer's subtitle choice while it is open.
		if (video?.webkitEnterFullscreen) {
			const setTracks = (mode: TextTrackMode) => {
				for (const track of Array.from(video.textTracks)) track.mode = mode;
			};
			setTracks(captions ? "showing" : "hidden");
			video.addEventListener("webkitendfullscreen", () => setTracks("hidden"), {
				once: true,
			});
			video.webkitEnterFullscreen();
			return;
		}
		toast.danger("Fullscreen is unavailable in this browser.");
	}, [captions, videoRef]);
	async function pictureInPicture() {
		try {
			if (document.pictureInPictureElement) await document.exitPictureInPicture();
			else await videoRef.current?.requestPictureInPicture();
		} catch {
			toast.danger("Picture in picture is unavailable for this recording.");
		}
	}

	useEffect(() => {
		setPip(!!document.pictureInPictureEnabled);
		if (!markers.current) return;
		const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
		observer.observe(markers.current);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		function keyboard(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (
				e.defaultPrevented ||
				e.metaKey ||
				e.ctrlKey ||
				e.altKey ||
				target.closest(
					'input, textarea, select, button, a, [role="slider"], [role="tab"], [role="menuitem"], [contenteditable="true"]',
				)
			)
				return;
			const video = videoRef.current;
			if (!video) return;
			switch (e.key.toLowerCase()) {
				case " ":
				case "k":
					e.preventDefault();
					void togglePlay();
					break;
				case "arrowleft":
					e.preventDefault();
					seek(video.currentTime - 5);
					break;
				case "arrowright":
					e.preventDefault();
					seek(video.currentTime + 5);
					break;
				case "m":
					toggleMute();
					break;
				case "f":
					void fullscreen();
					break;
				case "c":
					setCaptions((value) => !value);
					break;
			}
		}
		document.addEventListener("keydown", keyboard);
		return () => document.removeEventListener("keydown", keyboard);
	}, [seek, videoRef, togglePlay, toggleMute, fullscreen]);

	return (
		<div
			className="video-area"
			style={videoRatio ? ({ "--video-ratio": videoRatio } as CSSProperties) : undefined}
		>
			<Card
				ref={shell}
				className={`video-shell${controlsShown ? " controls-shown" : ""}${started && !controlsShown ? " controls-hidden" : ""}${started ? " is-started" : ""}${ended ? " is-ended" : ""}`}
				onPointerMove={wakeControls}
				onPointerDown={(event) => {
					tapIsPhoneTouch.current =
						event.pointerType === "touch" &&
						window.matchMedia("(max-width: 760px)").matches;
					tapStartedShown.current = controlsShownNow.current;
					wakeControls();
				}}
				onPointerLeave={(event) => {
					// Touch screens fire this after every tap; only a real pointer leaving counts.
					if (event.pointerType === "touch") return;
					setPointerInside(false);
					setPointerActive(false);
				}}
				onFocus={wakeControls}
			>
				<div className="video-stage">
					<div className="video-frame">
						<video
							ref={videoRef}
							src={`/v/${data.shareCode}`}
							poster={poster}
							preload="metadata"
							playsInline
							onClick={() => {
								if (!started || !tapIsPhoneTouch.current) return void togglePlay();
								if (tapStartedShown.current) {
									window.clearTimeout(idleTimer.current);
									setPointerActive(false);
									setPointerInside(false);
								}
							}}
							onPlay={() => {
								setPlaying(true);
								setStarted(true);
								setEnded(false);
							}}
							onPause={() => setPlaying(false)}
							onWaiting={() => setWaiting(true)}
							onPlaying={() => setWaiting(false)}
							onCanPlay={() => setWaiting(false)}
							onError={() => {
								setError(true);
								setWaiting(false);
							}}
							onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
							onVolumeChange={(e) => {
								setVolume(e.currentTarget.volume);
								setMuted(e.currentTarget.muted);
							}}
							onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
							onEnded={() => {
								setEnded(true);
								setPlaying(false);
							}}
							onSeeking={() => setEnded(false)}
							onLoadedMetadata={(e) => {
								const video = e.currentTarget;
								if (video.videoWidth > 0 && video.videoHeight > 0)
									setVideoRatio(video.videoWidth / video.videoHeight);
								onDuration(Number.isFinite(video.duration) ? video.duration : 0);
								// Loading resets the rate to defaultPlaybackRate, so set both.
								video.defaultPlaybackRate = DEFAULT_SPEED;
								video.playbackRate = DEFAULT_SPEED;
								const start = Number(new URLSearchParams(location.search).get("t"));
								if (Number.isFinite(start) && start > 0 && start < video.duration)
									video.currentTime = start;
								for (const track of Array.from(video.textTracks))
									track.mode = "hidden";
							}}
						>
							{data.segments.length > 0 && (
								<track
									kind="captions"
									src={`/vtt/${data.shareCode}`}
									srcLang="en"
									label="English"
								/>
							)}
						</video>
						{/* The title cover shows before the first play; at the end only the replay button stays. */}
						{((!started && !error) || (ended && !error && !cta)) && (
							<button
								type="button"
								className="video-cover"
								data-ended={ended}
								aria-label={`${ended ? "Replay" : "Play"} ${data.video.title}`}
								onClick={() => {
									if (ended) seek(0);
									void togglePlay();
								}}
							>
								<span className="video-cover-play" aria-hidden="true">
									{ended ? (
										<ArrowCounterClockwiseIcon size={24} />
									) : (
										<PlayIcon size={24} weight="fill" className="icon-solid" />
									)}
								</span>
								{!ended && (
								<span className="video-cover-text">
									<span className="video-cover-title">{data.video.title}</span>
									<span className="video-cover-meta">
										<span className="video-cover-details">
											{[
												formatCoverDuration(
													duration || data.video.duration,
												),
												formatDate(data.video.created_at),
											]
												.filter(Boolean)
												.join(" / ")}
										</span>
									</span>
								</span>
								)}
							</button>
						)}
					</div>
					{waiting && playing && (
						<div className="video-play-overlay">
							<Spinner label="Buffering video" />
						</div>
					)}
					{error && (
						<div className="video-end-card">
							<p>We couldn’t load this video.</p>
							<Button
								variant="secondary"
								onPress={() => {
									setError(false);
									videoRef.current?.load();
								}}
							>
								Try again
							</Button>
						</div>
					)}
					{captions && caption && (
						<div className="video-caption">
							<span>
								{caption.speaker && `${caption.speaker}: `}
								{caption.text}
							</span>
						</div>
					)}
					<div className="timestamp-reactions" aria-hidden="true">
						{reactions
							.filter(
								(reaction) =>
									time >= reaction.timestamp && time < reaction.timestamp + 3,
							)
							.slice(-12)
							.map((reaction, index) => (
								<span
									className="timestamp-reaction"
									key={`${reaction.created_at}-${reaction.timestamp}-${index}`}
									style={{ left: `${15 + ((index * 19) % 70)}%` }}
								>
									{reaction.emoji}
								</span>
							))}
					</div>
					{ended && cta && (
						<div className="video-end-card">
							<Link
								className="button button--primary"
								href={cta}
								target="_blank"
								rel="noopener noreferrer"
							>
								{data.video.cta_text || "Learn more"}
							</Link>
							<Button
								variant="secondary"
								onPress={() => {
									seek(0);
									void togglePlay();
								}}
							>
								<ArrowCounterClockwiseIcon size={16} />
								Replay
							</Button>
						</div>
					)}
				</div>
				{/* Phones: big controls in the middle of the video, like a phone's own player. */}
				{started && !ended && !error && (
					<div className="touch-controls">
						<div className="touch-controls-row">
							<SpeedMenu
								speed={speed}
								onSpeed={setRate}
								onOpenChange={setMenuOpen}
								captions={
									data.segments.length > 0
										? { on: captions, toggle: () => setCaptions((on) => !on) }
										: undefined
								}
								trigger={
									<Button isIconOnly variant="ghost" aria-label="Settings">
										<GearSixIcon size={20} />
									</Button>
								}
							/>
							<Button
								isIconOnly
								variant="ghost"
								aria-label="Back 5 seconds"
								onPress={() => seek(time - 5)}
							>
								<ClockCounterClockwiseIcon size={20} />
							</Button>
							<Button
								isIconOnly
								variant="ghost"
								className="touch-play"
								aria-label={playing ? "Pause" : "Play"}
								onPress={() => void togglePlay()}
							>
								{playing ? (
									<PauseIcon size={20} weight="fill" className="icon-solid" />
								) : (
									<PlayIcon size={20} weight="fill" className="icon-solid" />
								)}
							</Button>
							<Button
								isIconOnly
								variant="ghost"
								aria-label="Forward 5 seconds"
								onPress={() => seek(time + 5)}
							>
								<ClockClockwiseIcon size={20} />
							</Button>
							<Button
								isIconOnly
								variant="ghost"
								aria-label="Fullscreen"
								onPress={() => void fullscreen()}
							>
								<ArrowsOutSimpleIcon size={20} />
							</Button>
						</div>
						<span className="touch-time">
							{formatTimestamp(time)} / {formatTimestamp(duration)}
						</span>
					</div>
				)}
				<div className="video-toolbar">
					<div
						ref={markers}
						className="timeline-markers"
						aria-label="Comments and reactions on the timeline"
					>
						{clusterTimeline(
							[
								...comments.map(
									(item): TimelineItem => ({
										timestamp: item.timestamp,
										kind: "comment",
										label: `${item.author_name}: ${item.text}`,
									}),
								),
								...reactions.map(
									(item): TimelineItem => ({
										timestamp: item.timestamp,
										kind: "reaction",
										emoji: item.emoji,
										label: `${item.emoji} reaction`,
									}),
								),
								...data.chapters.map(
									(item): TimelineItem => ({
										timestamp: item.timestamp,
										kind: "chapter",
										label: `Chapter: ${item.title}`,
									}),
								),
							],
							duration,
							trackWidth,
						).map((cluster, index) => (
							<Tooltip key={`timeline-${index}`}>
								<Button
									size="sm"
									variant={cluster.members.length > 1 ? "primary" : "ghost"}
									className="timeline-marker"
									style={{
										left: `${duration ? Math.max(2, Math.min(98, (cluster.time / duration) * 100)) : 2}%`,
									}}
									aria-label={`${cluster.members.length > 1 ? `${cluster.members.length} items` : cluster.members[0].label} at ${formatTimestamp(cluster.time)}`}
									onPress={() => seek(cluster.members[0].timestamp)}
								>
									{cluster.members.length > 1 ? (
										cluster.members.length
									) : cluster.members[0].kind === "reaction" ? (
										<span aria-hidden="true">{cluster.members[0].emoji}</span>
									) : cluster.members[0].kind === "comment" ? (
										<ChatCircleIcon size={16} />
									) : (
										"•"
									)}
								</Button>
								<Tooltip.Content>
									{cluster.members
										.map(
											(item) =>
												`${formatTimestamp(item.timestamp)} ${item.label}`,
										)
										.join(" · ")}
								</Tooltip.Content>
							</Tooltip>
						))}
					</div>
					<div className="video-progress">
						<div className="seek-track" aria-hidden="true">
							<div ref={seekFill} className="seek-fill" />
						</div>
						<input
							className="video-seek-input"
							type="range"
							aria-label="Seek video"
							aria-valuetext={`${formatTimestamp(time)} of ${formatTimestamp(duration)}`}
							min={0}
							max={duration || 1}
							step={0.1}
							value={Math.min(time, duration || 0)}
							disabled={!duration}
							onChange={(event) => seek(Number(event.currentTarget.value))}
						/>
					</div>
					<div className="video-controls">
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							aria-label={playing ? "Pause" : "Play"}
							onPress={() => void togglePlay()}
						>
							{playing ? (
								<PauseIcon size={16} weight="fill" className="icon-solid" />
							) : (
								<PlayIcon size={16} weight="fill" className="icon-solid" />
							)}
						</Button>
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							className="skip-control"
							aria-label="Back 5 seconds"
							onPress={() => seek(time - 5)}
						>
							<ClockCounterClockwiseIcon size={16} />
						</Button>
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							className="skip-control"
							aria-label="Forward 5 seconds"
							onPress={() => seek(time + 5)}
						>
							<ClockClockwiseIcon size={16} />
						</Button>
						{/* The volume bar slides out while the speaker button or bar is hovered. */}
						<div className="volume-group">
							<Button
								isIconOnly
								size="sm"
								variant="ghost"
								aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
								onPress={toggleMute}
							>
								{muted || volume === 0 ? (
									<SpeakerSlashIcon size={16} />
								) : (
									<SpeakerHighIcon size={16} />
								)}
							</Button>
							<Slider
								className="volume-control"
								aria-label="Volume"
								minValue={0}
								maxValue={1}
								step={0.05}
								value={muted ? 0 : volume}
								onChange={(value) => {
									if (videoRef.current) {
										videoRef.current.volume = Number(value);
										videoRef.current.muted = Number(value) === 0;
										if (Number(value)) savedVolume.current = Number(value);
									}
								}}
							>
								<Slider.Track>
									<Slider.Fill />
									<Slider.Thumb />
								</Slider.Track>
							</Slider>
						</div>
						<span className="video-time">
							{formatTimestamp(time)} / {formatTimestamp(duration)}
						</span>
						<span className="control-spacer" />
						{data.segments.length > 0 && (
							<Button
								isIconOnly
								size="sm"
								variant="ghost"
								aria-label="Captions"
								aria-pressed={captions}
								onPress={() => setCaptions(!captions)}
							>
								<ClosedCaptioningIcon size={16} />
							</Button>
						)}
						<SpeedMenu
							speed={speed}
							onSpeed={setRate}
							onOpenChange={setMenuOpen}
							trigger={
								<Button
									size="sm"
									variant="ghost"
									className="speed-control"
									aria-label={`Playback speed: ${speed}×`}
								>
									{speed}×
								</Button>
							}
						/>
						{pip && (
							<Button
								isIconOnly
								size="sm"
								variant="ghost"
								className="pip-control"
								aria-label="Picture in picture"
								onPress={() => void pictureInPicture()}
							>
								<PictureInPictureIcon size={16} />
							</Button>
						)}
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							aria-label="Fullscreen"
							onPress={() => void fullscreen()}
						>
							<ArrowsOutSimpleIcon size={16} />
						</Button>
					</div>
				</div>
			</Card>
		</div>
	);
}
