import { useEffect, useState } from "react";
import type { RecordingLibraryEntry } from "@/types/recordingLibrary";

// Front panel: raised left edge stepping down to the right, rounded corners (0–1 units).
const FRONT_PATH =
	"M0.04,0.02 H0.47 C0.52,0.02 0.54,0.05 0.57,0.1 C0.6,0.15 0.62,0.17 0.67,0.17 H0.96 C0.985,0.17 1,0.19 1,0.22 V0.92 C1,0.965 0.975,1 0.94,1 H0.06 C0.025,1 0,0.965 0,0.92 V0.08 C0,0.045 0.015,0.02 0.04,0.02 Z";
type Point = [number, number];
// The same outline as points for clip-path: polygon(), which the backdrop blur respects.
const FRONT_POLYGON = (() => {
	const cubic = (p0: Point, p1: Point, p2: Point, p3: Point, steps = 10) =>
		Array.from({ length: steps }, (_, index) => {
			const t = (index + 1) / steps;
			const u = 1 - t;
			return [
				u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
				u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
			] as Point;
		});
	const points: Point[] = [
		[0.04, 0.02],
		[0.47, 0.02],
		...cubic([0.47, 0.02], [0.52, 0.02], [0.54, 0.05], [0.57, 0.1]),
		...cubic([0.57, 0.1], [0.6, 0.15], [0.62, 0.17], [0.67, 0.17]),
		[0.96, 0.17],
		...cubic([0.96, 0.17], [0.985, 0.17], [1, 0.19], [1, 0.22]),
		[1, 0.92],
		...cubic([1, 0.92], [1, 0.965], [0.975, 1], [0.94, 1]),
		[0.06, 1],
		...cubic([0.06, 1], [0.025, 1], [0, 0.965], [0, 0.92]),
		[0, 0.08],
		...cubic([0, 0.08], [0, 0.045], [0.015, 0.02], [0.04, 0.02]),
	];
	return `polygon(${points.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ")})`;
})();
// The front covers the bottom 74% of the folder; the blurred copy is drawn in folder coordinates.
const FRONT_HEIGHT = 0.74;
const FRONT_OFFSET = (1 - FRONT_HEIGHT) / FRONT_HEIGHT;

function posterProps(poster: string, index: number, open: boolean) {
	return {
		src: poster,
		alt: "",
		draggable: false,
		className:
			"absolute h-[56%] w-[86%] rounded-[7%] object-cover shadow-lg transition-transform duration-300 ease-out",
		style: {
			left: index === 0 ? "4%" : "10%",
			top: index === 0 ? "5%" : "9%",
			zIndex: index === 0 ? 1 : 2,
			transform: `translateY(${open ? -12 : 0}%) rotate(${index === 0 ? -2.5 : 2}deg)`,
		},
	};
}

const isAudio = (name: string) => /\.(wav|m4a|mp3|ogg|flac)$/i.test(name);

/** Poster frames of up to two videos, screen recording first. */
function useFolderPosters(sources: RecordingLibraryEntry[]) {
	const [posters, setPosters] = useState<string[]>([]);
	const key = sources.map((source) => source.path).join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the source list.
	useEffect(() => {
		let active = true;
		const videos = sources
			.filter((source) => !isAudio(source.name))
			.sort((a, b) => Number(/-webcam\./i.test(a.name)) - Number(/-webcam\./i.test(b.name)))
			.slice(0, 2);
		void Promise.all(
			videos.map((video) =>
				window.electronAPI
					.getRecordingThumbnail(video.path)
					.then((result) => (result.success ? result.value : null))
					.catch(() => null),
			),
		).then((results) => {
			if (active) setPosters(results.filter((value): value is string => Boolean(value)));
		});
		return () => {
			active = false;
		};
	}, [key]);
	return posters;
}

/** A folder with its recordings peeking out behind a frosted front, like a macOS folder icon. */
export function FrostedFolder({
	sources,
	open,
}: {
	sources: RecordingLibraryEntry[];
	open: boolean;
}) {
	const posters = useFolderPosters(sources);
	return (
		<div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-default/40">
			<div className="relative h-[72%] w-[70%]">
				{/* Back of the folder. */}
				<div className="absolute inset-x-[2%] top-0 h-[88%] rounded-[10%/13%] bg-[linear-gradient(180deg,rgba(150,150,158,0.55),rgba(90,90,98,0.5))] ring-1 ring-white/20" />
				{/* Recordings tucked inside. */}
				{posters.map((poster, index) => (
					<img key={poster.slice(-24)} {...posterProps(poster, index, open)} />
				))}
				{/* Frosted front: a blurred copy of the same posters, clipped to the front's shape. */}
				<div
					className="absolute inset-x-0 bottom-0 z-10 h-[74%] overflow-hidden"
					style={{ clipPath: FRONT_POLYGON }}
				>
					<div
						className="absolute inset-x-0"
						style={{
							top: `${-FRONT_OFFSET * 100}%`,
							height: `${(1 + FRONT_OFFSET) * 100}%`,
							filter: "blur(12px) saturate(0.75)",
						}}
					>
						<div className="absolute inset-0 bg-[rgb(110,110,118)]" />
						{posters.map((poster, index) => (
							<img key={poster.slice(-24)} {...posterProps(poster, index, open)} />
						))}
					</div>
					<div
						className="absolute inset-0"
						style={{
							background:
								"linear-gradient(180deg, rgba(232,232,236,0.6) 0%, rgba(178,178,186,0.52) 55%, rgba(128,128,136,0.55) 100%)",
						}}
					/>
				</div>
				{/* Bright rim along the front's edge. */}
				<svg
					viewBox="0 0 1 1"
					preserveAspectRatio="none"
					aria-hidden="true"
					// The card is a button, whose icon sizing would otherwise shrink this drawing.
					className="pointer-events-none absolute inset-x-0 bottom-0 z-10 !h-[74%] !w-full overflow-visible"
				>
					<path
						d={FRONT_PATH}
						fill="none"
						stroke="rgba(255,255,255,0.55)"
						strokeWidth="1"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			</div>
		</div>
	);
}
