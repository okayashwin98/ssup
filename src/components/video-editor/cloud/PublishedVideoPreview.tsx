import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "@/components/ui/icons";

/** The video as it now plays on the share page, streamed from the share service. */
export function PublishedVideoPreview({ url }: { url: string }) {
	const video = useRef<HTMLVideoElement>(null);
	const [started, setStarted] = useState(false);
	const [posterFailed, setPosterFailed] = useState(false);
	const [failed, setFailed] = useState(false);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
	const code = parsed.pathname.match(/^\/s\/([a-z0-9]+)\/?$/i)?.[1];
	if (!code) return null;
	const poster = `${parsed.origin}/thumb/${code}`;
	return (
		<div className="relative aspect-video overflow-hidden rounded-xl bg-black">
			<video
				ref={video}
				src={`${parsed.origin}/v/${code}`}
				poster={posterFailed ? undefined : poster}
				aria-label="Shared video preview"
				className="h-full w-full object-contain"
				preload="metadata"
				playsInline
				controls={started}
				onPlay={() => setStarted(true)}
				onError={() => setFailed(true)}
			/>
			{!posterFailed && (
				<img src={poster} alt="" className="hidden" onError={() => setPosterFailed(true)} />
			)}
			{failed ? (
				<p
					role="status"
					className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/80"
				>
					Preview unavailable. Your link still works.
				</p>
			) : (
				!started && (
					<Button
						type="button"
						variant="accent"
						size="icon"
						aria-label="Play shared video"
						className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full"
						onClick={() => {
							void video.current?.play().catch(() => setFailed(true));
						}}
					>
						<Play weight="fill" className="size-5" />
					</Button>
				)
			)}
		</div>
	);
}
