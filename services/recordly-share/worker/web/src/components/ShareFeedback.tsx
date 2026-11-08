import { Avatar, Button, Card, Input, Modal, Tabs, TextField, toast } from "@heroui/react";
import {
	ArrowUpIcon,
	ChatCenteredTextIcon,
	ChatCircleIcon,
	InfoIcon,
	LinkSimpleIcon,
	TextAlignLeftIcon,
} from "@phosphor-icons/react";
import {
	type Dispatch,
	type FormEvent,
	type RefObject,
	type SetStateAction,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	type Comment,
	fetchAllComments,
	formatDate,
	formatTimestamp,
	postComment,
	type ShareData,
} from "../scripts/api";
import { timestampParts } from "../scripts/shareModel";
import { copyLink, Spinner } from "./ShareUI";

interface Props {
	data: ShareData;
	time: number;
	duration: number;
	comments: Comment[];
	setComments: Dispatch<SetStateAction<Comment[]>>;
	seek: (time: number) => void;
	composerRef: RefObject<HTMLTextAreaElement | null>;
	selectedTab: string;
	setSelectedTab: (tab: string) => void;
}

const phoneQuery = "(max-width: 760px)";
const NAME_KEY = "recordly-comment-name";

/** Viewers comment under one of these until they pick their own name. */
export const VIEWER_NAMES = [
	"Curious Otter",
	"Brave Fox",
	"Gentle Panda",
	"Quiet Owl",
	"Swift Falcon",
	"Sunny Koala",
	"Clever Raven",
	"Calm Turtle",
	"Bright Hummingbird",
	"Bold Tiger",
	"Happy Dolphin",
	"Witty Penguin",
	"Lucky Rabbit",
	"Cosy Bear",
	"Keen Hawk",
	"Merry Llama",
	"Nimble Squirrel",
	"Kind Elephant",
	"Jolly Seal",
	"Wise Badger",
];

/** The saved commenter name, or a random viewer name that is then remembered. */
function savedName() {
	try {
		const stored = localStorage.getItem(NAME_KEY)?.trim();
		if (stored) return stored;
	} catch {
		/* Storage can be disabled. */
	}
	const name = VIEWER_NAMES[Math.floor(Math.random() * VIEWER_NAMES.length)];
	saveName(name);
	return name;
}

function saveName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		/* The name still works for this visit. */
	}
}

/** True on phone-width screens, matching the page's phone layout. */
function usePhoneWidth() {
	return useSyncExternalStore(
		(onChange) => {
			const media = window.matchMedia(phoneQuery);
			media.addEventListener("change", onChange);
			return () => media.removeEventListener("change", onChange);
		},
		() => window.matchMedia(phoneQuery).matches,
		() => false,
	);
}

let measureContext: CanvasRenderingContext2D | null = null;

/** Whether the draft needs more than one line in the single-line comment box. */
function needsMoreLines(box: HTMLElement | null, field: HTMLTextAreaElement | null, text: string) {
	if (!text) return false;
	if (text.includes("\n")) return true;
	if (!box || !field) return false;
	measureContext ??= document.createElement("canvas").getContext("2d");
	if (!measureContext) return false;
	const style = getComputedStyle(field);
	measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	// Box padding 4+4, send button 40, gap 4, text padding 12+12.
	const room = box.clientWidth - 8 - 40 - 4 - 24;
	return measureContext.measureText(text).width > room - 1;
}

function NameModal({
	name,
	open,
	onClose,
	onSave,
}: {
	name: string;
	open: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
}) {
	const [draft, setDraft] = useState(name);
	useEffect(() => {
		if (open) setDraft(name);
	}, [open, name]);
	const trimmed = draft.trim();
	function save(event?: FormEvent) {
		event?.preventDefault();
		if (trimmed) onSave(trimmed.slice(0, 100));
	}
	return (
		<Modal
			isOpen={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<Modal.Backdrop className="name-modal-backdrop">
				<Modal.Container placement="center">
					<Modal.Dialog className="name-modal" aria-labelledby="name-modal-title">
						<form onSubmit={save} className="name-modal-form">
							<div className="name-modal-heading">
								<h2 id="name-modal-title">Your name</h2>
								<p>
									Shown next to your comments on this recording. You can change it
									any time.
								</p>
							</div>
							<TextField
								aria-label="Your name"
								value={draft}
								onChange={setDraft}
								className="name-modal-field"
							>
								<Input maxLength={100} autoComplete="name" autoFocus />
							</TextField>
							<div className="name-modal-actions">
								<Button variant="ghost" onPress={onClose}>
									Cancel
								</Button>
								<Button type="submit" isDisabled={!trimmed}>
									Save
								</Button>
							</div>
						</form>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}

export default function ShareFeedback({
	data,
	time,
	duration,
	comments,
	setComments,
	seek,
	composerRef,
	selectedTab,
	setSelectedTab,
}: Props) {
	const [name, setName] = useState("");
	const [naming, setNaming] = useState(false);
	const [text, setText] = useState("");
	const [lockedTime, setLockedTime] = useState<number | null>(null);
	const [posting, setPosting] = useState(false);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState("");
	const [postError, setPostError] = useState("");
	const error = postError || loadError;
	const [multiline, setMultiline] = useState(false);
	const commentBox = useRef<HTMLDivElement>(null);
	// A draft is pinned to where typing began; jumping to another moment moves the pin there.
	const lastTime = useRef(time);
	useEffect(() => {
		if (Math.abs(time - lastTime.current) > 1.5)
			setLockedTime((locked) => (locked === null ? null : time));
		lastTime.current = time;
	}, [time]);
	// Phones show comments only.
	const phone = usePhoneWidth();
	const showTranscript = !phone && data.segments.length > 0;
	const showDetails = !phone && Boolean(data.video.summary || data.chapters.length > 0);
	const tabbed = showTranscript || showDetails;
	const activeIndex = comments.reduce(
		(found, comment, i) => (comment.timestamp <= time + 0.3 ? i : found),
		-1,
	);
	const pinnedTime = lockedTime ?? time;

	// Wrapping text turns the pill into a taller box with the send button below the text.
	useLayoutEffect(() => {
		const update = () =>
			setMultiline(needsMoreLines(commentBox.current, composerRef.current, text));
		update();
		const box = commentBox.current;
		if (!box) return;
		const observer = new ResizeObserver(update);
		observer.observe(box);
		return () => observer.disconnect();
	}, [text, composerRef]);
	// The taller box grows with the text, up to a limit, then scrolls.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measures whenever the text changes.
	useLayoutEffect(() => {
		const field = composerRef.current;
		if (!field) return;
		field.style.height = "";
		if (!multiline) return;
		field.style.height = "auto";
		field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
	}, [text, multiline, composerRef]);

	useEffect(() => {
		setName(savedName());
		let cancelled = false;
		fetchAllComments(data.shareCode)
			.then((result) => {
				if (cancelled) return;
				setComments(
					[...result.comments].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id),
				);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) {
					setLoadError("Comments could not be loaded. Reload to try again.");
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [data.shareCode, setComments]);

	async function submit() {
		if (posting || !name.trim() || !text.trim()) return;
		const timestamp = pinnedTime;
		setPosting(true);
		setPostError("");
		try {
			const id = await postComment(data.shareCode, timestamp, name.trim(), text.trim());
			setComments((current) =>
				[
					...current,
					{
						id,
						timestamp,
						author_name: name.trim(),
						text: text.trim(),
						created_at: new Date().toISOString().slice(0, 19),
					},
				].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id),
			);
			setText("");
			setLockedTime(null);
			toast.success(`Comment posted at ${formatTimestamp(timestamp)}`);
		} catch {
			setPostError("Could not post your comment. Please try again.");
		} finally {
			setPosting(false);
		}
	}

	const canSend = Boolean(name.trim() && text.trim()) && !posting;

	return (
		<Card className="feedback-card">
			{!tabbed && (
				<div className="feedback-header">
					<h2 className="feedback-title">Comments</h2>
				</div>
			)}
			<Tabs
				selectedKey={tabbed ? selectedTab : "comments"}
				onSelectionChange={(key) => setSelectedTab(String(key))}
				className="feedback-tabs"
			>
				{/* With comments alone, the title above stands in for the switcher. */}
				<Tabs.ListContainer className={tabbed ? undefined : "hidden"}>
					<Tabs.List aria-label="Recording feedback">
						<Tabs.Tab
							id="comments"
							aria-label={
								comments.length > 0 ? `Comments, ${comments.length}` : "Comments"
							}
						>
							<ChatCenteredTextIcon size={18} />
							<Tabs.Indicator />
						</Tabs.Tab>
						{showTranscript && (
							<Tabs.Tab id="transcript" aria-label="Transcript">
								<TextAlignLeftIcon size={18} />
								<Tabs.Indicator />
							</Tabs.Tab>
						)}
						{showDetails && (
							<Tabs.Tab id="details" aria-label="Details">
								<InfoIcon size={18} />
								<Tabs.Indicator />
							</Tabs.Tab>
						)}
					</Tabs.List>
				</Tabs.ListContainer>
				<Tabs.Panel id="comments" aria-label="Comments">
					{loading ? (
						<div className="empty-feedback">
							<Spinner label="Loading comments" />
						</div>
					) : !comments.length ? (
						<div className="empty-feedback">
							<ChatCircleIcon size={28} />
							<h2>Start the conversation</h2>
							<p>Leave feedback at the exact moment you’re watching.</p>
						</div>
					) : (
						comments.map((comment, i) => (
							<article
								className="comment-item"
								data-active={i === activeIndex}
								key={comment.id}
							>
								<div className="comment-heading">
									<Avatar size="sm">
										<Avatar.Fallback>
											{comment.author_name.slice(0, 2).toUpperCase()}
										</Avatar.Fallback>
									</Avatar>
									<strong>{comment.author_name}</strong>
									<Button
										size="sm"
										variant="ghost"
										aria-label={`Jump to ${formatTimestamp(comment.timestamp)}`}
										onPress={() => seek(comment.timestamp)}
									>
										<span className="timestamp">
											{formatTimestamp(comment.timestamp)}
										</span>
									</Button>
								</div>
								<p>
									{timestampParts(comment.text, duration).map((part, n) =>
										part.time === undefined ? (
											part.text
										) : (
											<Button
												key={n}
												size="sm"
												variant="ghost"
												className="inline-timestamp timestamp"
												onPress={() => seek(part.time!)}
											>
												{part.text}
											</Button>
										),
									)}
								</p>
								<span className="comment-date">
									{formatDate(comment.created_at)}
								</span>
							</article>
						))
					)}
				</Tabs.Panel>
				{showTranscript && (
					<Tabs.Panel id="transcript" aria-label="Transcript">
						{data.segments.map((segment, i) => (
							<article
								key={i}
								className="transcript-item"
								data-active={time >= segment.start_time && time < segment.end_time}
							>
								<div className="transcript-heading">
									<Button
										size="sm"
										variant="ghost"
										onPress={() => seek(segment.start_time)}
									>
										<span className="timestamp">
											{formatTimestamp(segment.start_time)}
										</span>
									</Button>
									{segment.speaker && (
										<span className="transcript-speaker">
											{segment.speaker}
										</span>
									)}
									<Button
										size="sm"
										variant="ghost"
										isIconOnly
										className="copy-timestamp"
										aria-label={`Copy link to ${formatTimestamp(segment.start_time)}`}
										onPress={() => void copyLink(segment.start_time)}
									>
										<LinkSimpleIcon size={16} />
									</Button>
								</div>
								<Button
									variant="ghost"
									className="transcript-seek"
									onPress={() => seek(segment.start_time)}
								>
									{segment.text}
								</Button>
							</article>
						))}
					</Tabs.Panel>
				)}
				{showDetails && (
					<Tabs.Panel id="details" aria-label="Details" className="details-panel">
						<section className="recording-details">
							<h2>Recording</h2>
							<p>{data.video.title}</p>
						</section>
						{data.video.summary && (
							<section className="recording-details">
								<h2>Summary</h2>
								<p>{data.video.summary}</p>
							</section>
						)}
						{data.chapters.length > 0 && (
							<section className="recording-details">
								<h2>Chapters</h2>
								<div className="chapter-list">
									{data.chapters.map((chapter, index) => (
										<Button
											key={index}
											variant="ghost"
											onPress={() => seek(chapter.timestamp)}
										>
											<span className="timestamp">
												{formatTimestamp(chapter.timestamp)}
											</span>
											{chapter.title}
										</Button>
									))}
								</div>
							</section>
						)}
					</Tabs.Panel>
				)}
			</Tabs>
			<form
				className="composer"
				hidden={tabbed && selectedTab !== "comments"}
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				{error && (
					<p className="composer-error" role="alert">
						{error}
					</p>
				)}
				{/* The send button sits inside the comment field. */}
				<div
					ref={commentBox}
					className="comment-box"
					data-multiline={multiline}
					data-disabled={posting}
				>
					<textarea
						ref={composerRef}
						name="comment"
						aria-label="Comment"
						rows={1}
						maxLength={2000}
						placeholder="Share your thoughts…"
						value={text}
						disabled={posting}
						onChange={(e) => {
							const value = e.currentTarget.value;
							setText(value);
							if (postError) setPostError("");
							setLockedTime(value.trim() ? (lockedTime ?? time) : null);
						}}
						onKeyDown={(e) => {
							if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
								e.preventDefault();
								void submit();
							}
						}}
					/>
					<Button
						type="submit"
						isIconOnly
						className="send-button"
						aria-label={`Post comment at ${formatTimestamp(pinnedTime)}`}
						isDisabled={!canSend}
					>
						<ArrowUpIcon size={16} />
					</Button>
				</div>
				<div className="composer-meta">
					<span>
						as{" "}
						<button
							type="button"
							className="composer-name"
							aria-label={`Commenting as ${name}. Change name`}
							onClick={() => setNaming(true)}
						>
							{name}
						</button>
					</span>
					<span>
						at <span className="composer-time">{formatTimestamp(pinnedTime)}</span>
					</span>
				</div>
			</form>
			<NameModal
				name={name}
				open={naming}
				onClose={() => setNaming(false)}
				onSave={(value) => {
					setName(value);
					saveName(value);
					setNaming(false);
				}}
			/>
		</Card>
	);
}
