import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { subscribeShareCapacityChanges } from "../cloud/shareCapacity";
import { parseSharedRecordingDate } from "../cloud/sharedRecordingDate";
import { ProjectThumbnail } from "./ProjectThumbnail";
import {
	peekRecentSharedVideos,
	readRecentSharedVideos,
	type SharedVideo,
} from "./recentSharedVideoCache";

/** Home's row of the newest shared links; renders nothing until there is something to show. */
export function RecentSharedVideos({
	token,
	endpoint,
	onViewAll,
	projectCount,
}: {
	token: string;
	endpoint: string;
	onViewAll: () => void;
	/** How many projects the grid below lists, shown beside its heading. */
	projectCount: number;
}) {
	const [videos, setVideos] = useState<SharedVideo[]>(
		() => peekRecentSharedVideos(endpoint) ?? [],
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>();
	const generation = useRef(0);
	const track = useRef<HTMLUListElement>(null);
	const [edges, setEdges] = useState({ left: false, right: false });
	useEffect(() => {
		const element = track.current;
		if (!element || !videos.length) return;
		const updateEdges = () =>
			setEdges({
				left: element.scrollLeft > 1,
				right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
			});
		updateEdges();
		element.addEventListener("scroll", updateEdges, { passive: true });
		const observer = new ResizeObserver(updateEdges);
		observer.observe(element);
		return () => {
			element.removeEventListener("scroll", updateEdges);
			observer.disconnect();
		};
	}, [videos]);
	const refresh = useCallback(
		async (fresh = false) => {
			const current = ++generation.current;
			setLoading(true);
			try {
				const result = await readRecentSharedVideos(endpoint, token, fresh);
				if (current !== generation.current) return;
				setVideos(result);
				setError(undefined);
			} catch (cause) {
				if (current === generation.current)
					setError(cause instanceof Error ? cause.message : String(cause));
			} finally {
				if (current === generation.current) setLoading(false);
			}
		},
		[token, endpoint],
	);
	useEffect(() => {
		void refresh();
		const unsubscribe = subscribeShareCapacityChanges(() => void refresh(true));
		const onFocus = () => void refresh();
		window.addEventListener("focus", onFocus);
		return () => {
			generation.current++;
			unsubscribe();
			window.removeEventListener("focus", onFocus);
		};
	}, [refresh]);
	const scroll = (direction: number) =>
		track.current?.scrollBy({
			left: direction * Math.max(260, track.current.clientWidth * 0.8),
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "instant"
				: "smooth",
		});
	const openVideo = async (video: SharedVideo) => {
		try {
			const result = await window.electronAPI.openExternalUrl(video.url);
			if (!result.success) throw new Error(result.error || "Could not open the link.");
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : String(cause));
		}
	};
	// Nothing shared yet, or the service could not be reached before anything was shown.
	if (!videos.length) {
		return error ? (
			<section aria-label="Recently shared" className="mb-6 text-xs text-muted-foreground">
				<span role="status">Couldn't load your shared videos.</span>{" "}
				<Button
					variant="link"
					size="sm"
					className="text-xs"
					onClick={() => void refresh(true)}
					disabled={loading}
				>
					Try again
				</Button>
			</section>
		) : null;
	}
	return (
		<>
			<section aria-label="Recently shared" className="mb-10 min-w-0">
				<div className="mb-4 flex items-center justify-between gap-3">
					<h2 className="text-base font-medium text-foreground">Recently shared</h2>
					<div className="flex items-center gap-1">
						<Button variant="ghost" size="sm" onClick={onViewAll}>
							View all
						</Button>
						{(edges.left || edges.right) && (
							<>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Previous shared videos"
									disabled={!edges.left}
									onClick={() => scroll(-1)}
								>
									<ArrowLeft className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Next shared videos"
									disabled={!edges.right}
									onClick={() => scroll(1)}
								>
									<ArrowRight className="size-4" />
								</Button>
							</>
						)}
					</div>
				</div>
				<ul
					ref={track}
					aria-label="Shared videos"
					aria-busy={loading}
					className="flex snap-x snap-mandatory gap-7 overflow-x-auto pb-1 [scrollbar-width:none] lg:gap-9"
					style={{
						maskImage:
							edges.left || edges.right
								? `linear-gradient(to right, ${edges.left ? "transparent, black 32px" : "black"}, ${edges.right ? "black calc(100% - 32px), transparent" : "black"})`
								: undefined,
					}}
				>
					{videos.map((video) => (
						<li key={video.code} className="w-56 shrink-0 snap-start">
							<button
								type="button"
								className="w-full rounded-xl text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
								aria-label={`Open ${video.title} in the browser`}
								onClick={() => void openVideo(video)}
							>
								<ProjectThumbnail
									path={
										new URL(
											`/thumb/${encodeURIComponent(video.code)}`,
											endpoint,
										).href
									}
									revision={parseSharedRecordingDate(video.createdAt)}
								/>
								<p className="mt-3 truncate text-sm font-medium text-foreground">
									{video.title}
								</p>
							</button>
						</li>
					))}
				</ul>
			</section>
			{/* With the row above, the project grid needs its own heading. */}
			<h2 className="mb-4 flex items-baseline gap-2 text-base font-medium text-foreground">
				Projects
				<span className="text-sm font-normal tabular-nums text-muted-foreground">
					{projectCount}
				</span>
			</h2>
		</>
	);
}
