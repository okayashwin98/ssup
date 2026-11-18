import { useTimelineContext } from "dnd-timeline";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { formatPlayheadTime } from "../../core/time";

// Sky-blue playhead: a rounded tab with a short point, on a 2px line.
const PLAYHEAD_BLUE = "#1A8FD1";

import {
	getPlayheadDisplayTime,
	getTimeAtClipSeam,
	type ClipPresentation,
} from "../../core/clipPresentation";

interface PlaybackCursorProps {
	clips: ClipPresentation[];
	currentTimeMs: number;
	videoDurationMs: number;
	onSeek?: (time: number) => void;
	timelineRef: RefObject<HTMLDivElement | null>;
	keyframes?: { id: string; time: number }[];
	isLoading?: boolean;
}

export default function PlaybackCursor({
	clips,
	currentTimeMs,
	videoDurationMs,
	onSeek,
	timelineRef,
	keyframes = [],
	isLoading = false,
}: PlaybackCursorProps) {
	const { sidebarWidth, direction, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";
	const [isDragging, setIsDragging] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	// Where the press on the tab began, and whether it has turned into a drag.
	const pressRef = useRef({ x: 0, moved: false });

	useEffect(() => {
		if (!isDragging) return;

		const seekTo = (e: MouseEvent) => {
			if (!timelineRef.current || !onSeek) return;
			const rect = timelineRef.current.getBoundingClientRect();
			const clickX =
				direction === "rtl"
					? rect.right - sidebarWidth - e.clientX
					: e.clientX - rect.left - sidebarWidth;
			const relativeMs = pixelsToValue(clickX);
			let absoluteMs = getTimeAtClipSeam(
				Math.max(0, Math.min(range.start + relativeMs, videoDurationMs)),
				clips,
			);

			const snapThresholdMs = 150;
			const nearbyKeyframe = keyframes.find(
				(kf) =>
					Math.abs(kf.time - absoluteMs) <= snapThresholdMs &&
					kf.time >= range.start &&
					kf.time <= range.end,
			);
			if (nearbyKeyframe) absoluteMs = nearbyKeyframe.time;

			onSeek(absoluteMs / 1000);
		};

		// The wide tab covers nearby time; a press that barely moves is a click,
		// so it seeks to the pointer instead of being swallowed by the tab.
		const handleMouseMove = (e: MouseEvent) => {
			if (!pressRef.current.moved && Math.abs(e.clientX - pressRef.current.x) < 3) return;
			pressRef.current.moved = true;
			seekTo(e);
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (!pressRef.current.moved) seekTo(e);
			setIsDragging(false);
			document.body.style.cursor = "";
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "ew-resize";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
	}, [
		isDragging,
		clips,
		onSeek,
		timelineRef,
		sidebarWidth,
		range.start,
		range.end,
		videoDurationMs,
		pixelsToValue,
		keyframes,
		direction,
	]);

	if (videoDurationMs <= 0 || currentTimeMs < 0) return null;
	const clampedTime = Math.min(currentTimeMs, videoDurationMs);
	if (clampedTime < range.start || clampedTime > range.end) return null;

	const offset = valueToPixels(getPlayheadDisplayTime(clampedTime, clips) - range.start);

	const expanded = isHovered || isDragging || isLoading;
	// Keep the timestamp inside the viewport even at either end of the timeline.
	const width = valueToPixels(range.end - range.start);
	const capShift = Math.max(0, 34 - offset) - Math.max(0, 34 - (width - offset));
	return (
		<div data-testid="timeline-playhead" className="absolute inset-0 z-50 pointer-events-none">
			<div
				className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2"
				style={{ [sideProperty]: sidebarWidth + offset, background: PLAYHEAD_BLUE }}
			>
				<div
					aria-hidden="true"
					className="absolute left-1/2 top-[11px] size-[9px] rounded-[2px] pointer-events-none"
					style={{
						background: PLAYHEAD_BLUE,
						transform: "translateX(-50%) rotate(45deg)",
					}}
				/>
				<button
					type="button"
					aria-label={`Playhead ${formatPlayheadTime(clampedTime)}`}
					data-no-auto-tooltip=""
					data-testid="playhead-cap"
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
					onFocus={() => setIsHovered(true)}
					onBlur={() => setIsHovered(false)}
					onClick={(event) => event.stopPropagation()}
					onMouseDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						event.stopPropagation();
						pressRef.current = { x: event.clientX, moved: false };
						setIsDragging(true);
					}}
					className="absolute top-0 h-4 rounded-[5px] text-white cursor-ew-resize pointer-events-auto overflow-hidden transition-[width,transform] duration-150"
					style={{
						width: expanded ? 68 : 16,
						background: PLAYHEAD_BLUE,
						left: "50%",
						transform: `translateX(calc(-50% + ${expanded ? (direction === "rtl" ? -capShift : capShift) : 0}px))`,
					}}
				>
					<span
						className={cn(
							"block whitespace-nowrap text-[10px] font-medium tabular-nums transition-opacity",
							expanded ? "opacity-100" : "opacity-0",
						)}
					>
						{formatPlayheadTime(clampedTime)}
					</span>
				</button>
			</div>
		</div>
	);
}
