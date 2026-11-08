import { Button, Input, Label, Skeleton, TextField, toast } from "@heroui/react";
import { ArrowClockwiseIcon, IconContext } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type Comment,
	fetchReactions,
	fetchShareData,
	formatTimestamp,
	isExpired,
	isPasswordRequired,
	isShareData,
	postReaction,
	type Reaction,
	type ShareData,
	verifyPassword,
} from "../scripts/api";
import ShareFeedback from "./ShareFeedback";
import SharePlayer from "./SharePlayer";
import {
	CenteredCard,
	CopyButton,
	Notifications,
	type Owner,
	OwnerAvatar,
	OwnerBrand,
} from "./ShareUI";
import ThemeToggle from "./ThemeToggle";

// Line icons are drawn thin and thickened to 1.25px in CSS (see "Icons" in global.css).
const LINE_ICONS = { weight: "thin" } as const;

const reactions = [
	{ emoji: "👍", label: "Like" },
	{ emoji: "❤️", label: "Love" },
	{ emoji: "😂", label: "Laugh" },
	{ emoji: "😮", label: "Surprised" },
	{ emoji: "🔥", label: "Fire" },
	{ emoji: "👏", label: "Applause" },
];

function Recording({ data }: { data: ShareData }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const composerRef = useRef<HTMLTextAreaElement>(null);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(data.video.duration);
	const [comments, setComments] = useState<Comment[]>([]);
	const [reactionEvents, setReactionEvents] = useState<Reaction[]>([]);
	const [reacting, setReacting] = useState<string | null>(null);
	const [selectedTab, setSelectedTab] = useState("comments");
	const seek = useCallback((value: number) => {
		const video = videoRef.current;
		if (video && Number.isFinite(video.duration)) {
			video.currentTime = Math.max(0, Math.min(video.duration, value));
			setTime(video.currentTime);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		fetchReactions(data.shareCode)
			.then((items) => {
				if (!cancelled) setReactionEvents((current) => [...items, ...current]);
			})
			.catch(() => {
				/* Feedback remains available if reactions fail to load. */
			});
		return () => {
			cancelled = true;
		};
	}, [data.shareCode]);

	async function react(emoji: string) {
		if (reacting) return;
		setReacting(emoji);
		const timestamp = videoRef.current?.currentTime || 0;
		try {
			if (!(await postReaction(data.shareCode, timestamp, emoji))) throw new Error();
			setReactionEvents((current) => [
				...current,
				{ timestamp, emoji, created_at: new Date().toISOString() },
			]);
			toast.success(`${emoji} Reaction at ${formatTimestamp(timestamp)}`);
		} catch {
			toast.danger("Could not add your reaction. Try again.");
		} finally {
			setReacting(null);
		}
	}

	const { video } = data;
	return (
		<div className="recording-app">
			<div className="share-workspace">
				<main className="recording-column">
					<div className="recording-heading viewer-heading">
						<OwnerAvatar owner={data.creator} />
						<h1 className="viewer-crumb" title={video.title}>
							{data.creator?.name && (
								<span className="viewer-crumb-owner">{data.creator.name} / </span>
							)}
							<span>{video.title}</span>
						</h1>
						<div className="viewer-heading-actions">
							<ThemeToggle />
							<CopyButton time={time} />
						</div>
					</div>
					<SharePlayer
						data={data}
						videoRef={videoRef}
						comments={comments}
						reactions={reactionEvents}
						time={time}
						duration={duration}
						onTime={setTime}
						onDuration={setDuration}
						seek={seek}
					/>
					<div className="reaction-rail">
						<div className="reaction-buttons" aria-label="Reactions">
							{reactions.map(({ emoji, label }) => (
								<Button
									key={emoji}
									size="sm"
									variant="ghost"
									aria-label={label}
									isDisabled={reacting !== null}
									onPress={() => void react(emoji)}
								>
									<span aria-hidden="true">{emoji}</span>
								</Button>
							))}
						</div>
					</div>
				</main>
				<aside aria-label="Recording feedback">
					<ShareFeedback
						data={data}
						time={time}
						duration={duration}
						comments={comments}
						setComments={setComments}
						seek={seek}
						composerRef={composerRef}
						selectedTab={selectedTab}
						setSelectedTab={setSelectedTab}
					/>
				</aside>
			</div>
		</div>
	);
}

export default function SharePage() {
	const [data, setData] = useState<ShareData | null>(null);
	const [view, setView] = useState<"loading" | "password" | "expired" | "error" | "recording">(
		"loading",
	);
	const [title, setTitle] = useState("Protected recording");
	const [owner, setOwner] = useState<Owner | null>(null);
	const [password, setPassword] = useState("");
	const [unlocking, setUnlocking] = useState(false);
	const [error, setError] = useState("");

	const load = useCallback(async () => {
		setView("loading");
		try {
			const code = location.pathname.split("/").filter(Boolean).pop() || "";
			const result = await fetchShareData(code);
			if (isExpired(result)) {
				setView("expired");
				document.title = "Recording unavailable — SuperShare";
			} else if (isPasswordRequired(result)) {
				setView("password");
				setTitle(result.title);
				setOwner(result.creator?.name ? result.creator : null);
				document.title = `${result.title} — SuperShare`;
			} else if (isShareData(result)) {
				setData(result);
				setView("recording");
				document.title = `${result.video.title} — SuperShare`;
			} else setView("error");
		} catch {
			setView("error");
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	async function unlock() {
		if (unlocking) return;
		setUnlocking(true);
		setError("");
		try {
			const code = location.pathname.split("/").filter(Boolean).pop() || "";
			if (await verifyPassword(code, password)) await load();
			else setError("That password didn’t match. Please try again.");
		} catch {
			setError("Could not unlock the recording. Please try again.");
		} finally {
			setUnlocking(false);
		}
	}

	return (
		<IconContext.Provider value={LINE_ICONS}>
			<Notifications />
			{view === "loading" ? (
				<div className="recording-app">
					<div
						className="share-workspace"
						aria-label="Loading recording"
						aria-busy="true"
					>
						<div className="recording-column">
							<div>
								<Skeleton className="loading-title" />
								<Skeleton className="loading-meta" />
							</div>
							<Skeleton className="loading-video" />
						</div>
						<Skeleton className="loading-sidebar" />
					</div>
				</div>
			) : view === "recording" && data ? (
				<Recording data={data} />
			) : (
				<CenteredCard
					header={view === "password" && owner ? <OwnerBrand owner={owner} /> : undefined}
				>
					{view === "password" ? (
						<>
							<h1>{title}</h1>
							<p>This recording is password protected.</p>
							<form
								className="gate-form"
								onSubmit={(e) => {
									e.preventDefault();
									void unlock();
								}}
							>
								<TextField
									value={password}
									onChange={setPassword}
									isRequired
									isDisabled={unlocking}
									className="gate-field"
								>
									<Label>Password</Label>
									<Input
										type="password"
										autoComplete="current-password"
										autoFocus
									/>
									{error && (
										<p className="field-error-text" role="alert">
											{error}
										</p>
									)}
								</TextField>
								<Button
									type="submit"
									isPending={unlocking}
									isDisabled={!password || unlocking}
								>
									{unlocking ? "Unlocking…" : "Unlock recording"}
								</Button>
							</form>
						</>
					) : view === "expired" ? (
						<>
							<h1>Recording unavailable</h1>
							<p>
								This link has expired or the recording has been removed. Ask the
								creator for a new link.
							</p>
						</>
					) : (
						<>
							<h1>Couldn’t load the recording</h1>
							<p>Check your connection and try again.</p>
							<Button onPress={() => void load()}>
								<ArrowClockwiseIcon size={16} />
								Try again
							</Button>
						</>
					)}
				</CenteredCard>
			)}
		</IconContext.Provider>
	);
}
