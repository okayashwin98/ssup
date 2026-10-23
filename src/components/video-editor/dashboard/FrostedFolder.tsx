import { useEffect, useId, useState } from "react";
import type { RecordingLibraryEntry } from "@/types/recordingLibrary";

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

// Drawn in a 4:3 box from the front's left edge to its bottom: a grey back panel with
// a dark window holding the recordings, and a frosted-glass front leaning towards the viewer,
// so its sides narrow going down.
const FRONT =
	"M133,232 H470 C540,232 555,316 625,316 H808 Q853,316 850,361 L832,640 Q828,698 770,698 H175 Q117,698 113,640 L91,277 Q88,232 133,232 Z";
// Recordings near their own 16:9 shape, tall enough to stay tucked in when lifted.
const POSTER_SLOTS = {
	1: [{ x: 143, y: 138, width: 662, height: 372 }],
	2: [
		{ x: 143, y: 138, width: 340, height: 191 },
		{ x: 440, y: 138, width: 365, height: 240 },
	],
} as const;

/** A folder with its recordings tucked behind a frosted-glass front, like a macOS folder. */
export function FrostedFolder({
	sources,
	open,
}: {
	sources: RecordingLibraryEntry[];
	open: boolean;
}) {
	const posters = useFolderPosters(sources);
	const id = useId().replace(/[^a-zA-Z0-9]/g, "");
	const ref = (name: string) => `url(#${name}${id})`;
	const slots = POSTER_SLOTS[posters.length === 1 ? 1 : 2];
	// What the glass sits over: the back panel, its window and the recordings in it.
	const back = (
		<>
			<rect x="120" y="118" width="706" height="570" rx="46" fill={ref("back")} />
			<rect x="143" y="138" width="662" height="540" rx="30" fill="rgb(20,20,22)" />
			{/* Not clipped to the window, so on hover the recordings rise out of the folder. */}
			<g
				className="transition-transform duration-300 ease-out"
				style={{ transform: `translateY(${open ? -50 : 0}px)` }}
			>
				{posters.map((poster, index) => (
					<image
						key={`${index}-${poster.length}`}
						href={poster}
						preserveAspectRatio="xMidYMid slice"
						clipPath={ref(`poster${index}`)}
						{...slots[index]}
					/>
				))}
			</g>
		</>
	);
	return (
		<div className="relative aspect-[4/3] w-full">
			<svg
				viewBox="88 124 765 574"
				aria-hidden="true"
				// The card is a button, whose icon sizing would otherwise shrink this drawing.
				className="absolute inset-0 !h-full !w-full overflow-visible"
			>
				<defs>
					{slots.map((slot, index) => (
						<clipPath key={slot.x} id={`poster${index}${id}`}>
							<rect {...slot} rx="30" />
						</clipPath>
					))}
					<clipPath id={`front${id}`}>
						<path d={FRONT} />
					</clipPath>
					<linearGradient id={`back${id}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="rgb(78,78,80)" />
						<stop offset="1" stopColor="rgb(52,52,54)" />
					</linearGradient>
					{/* Brightest just under the top edge, falling to about half by the bottom. */}
					<linearGradient
						id={`tint${id}`}
						gradientUnits="userSpaceOnUse"
						x1="0"
						y1="232"
						x2="0"
						y2="698"
					>
						<stop offset="0" stopColor="rgb(175,175,178)" stopOpacity="0.24" />
						<stop offset="0.25" stopColor="rgb(140,140,142)" stopOpacity="0.32" />
						<stop offset="0.6" stopColor="rgb(72,72,74)" stopOpacity="0.56" />
						<stop offset="1" stopColor="rgb(34,34,36)" stopOpacity="0.8" />
					</linearGradient>
					{/* The heavier blur fades in going down. */}
					<linearGradient
						id={`fade${id}`}
						gradientUnits="userSpaceOnUse"
						x1="0"
						y1="232"
						x2="0"
						y2="698"
					>
						<stop offset="0.1" stopColor="white" stopOpacity="0" />
						<stop offset="0.75" stopColor="white" stopOpacity="1" />
					</linearGradient>
					<mask
						id={`heavy${id}`}
						maskUnits="userSpaceOnUse"
						x="85"
						y="110"
						width="775"
						height="595"
					>
						<rect x="85" y="110" width="775" height="595" fill={ref("fade")} />
					</mask>
					{/* The rim: brightest along the top edge, dimmer down the sides and bottom. */}
					<linearGradient
						id={`rim${id}`}
						gradientUnits="userSpaceOnUse"
						x1="0"
						y1="232"
						x2="0"
						y2="698"
					>
						<stop offset="0" stopColor="white" stopOpacity="0.8" />
						<stop offset="0.25" stopColor="white" stopOpacity="0.42" />
						<stop offset="1" stopColor="white" stopOpacity="0.24" />
					</linearGradient>
					<filter id={`soft${id}`} x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur stdDeviation="44" />
						<feColorMatrix type="saturate" values="0.9" />
					</filter>
					<filter id={`deep${id}`} x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur stdDeviation="80" />
						<feColorMatrix type="saturate" values="0.85" />
					</filter>
					<filter id={`bevel${id}`} x="-10%" y="-10%" width="120%" height="120%">
						<feGaussianBlur stdDeviation="7" />
					</filter>
					{/* Faint vertical streaks, like reeded glass. */}
					<filter id={`grain${id}`} x="0" y="0" width="100%" height="100%">
						<feTurbulence
							type="fractalNoise"
							baseFrequency="0.25 0.004"
							numOctaves="2"
							seed="4"
						/>
						<feColorMatrix type="saturate" values="0" />
					</filter>
				</defs>

				{back}

				{/* The glass: lightly blurred at the top, heavily blurred and darker at the bottom. */}
				<g clipPath={ref("front")}>
					{/* Opaque base, so the sharp folder behind never shows through the blur's soft edges. */}
					<path d={FRONT} fill="rgb(26,26,28)" />
					<g filter={ref("soft")}>{back}</g>
					<g mask={ref("heavy")}>
						<g filter={ref("deep")}>{back}</g>
					</g>
					<path d={FRONT} fill={ref("tint")} />
					<rect
						x="85"
						y="110"
						width="775"
						height="595"
						filter={ref("grain")}
						opacity="0.03"
						style={{ mixBlendMode: "overlay" }}
					/>
					{/* Soft light just inside the edge, then a crisp rim on the edge itself. */}
					<path
						d={FRONT}
						fill="none"
						stroke="white"
						strokeOpacity="0.08"
						strokeWidth="18"
						filter={ref("bevel")}
					/>
					<path d={FRONT} fill="none" stroke={ref("rim")} strokeWidth="5" />
				</g>
			</svg>
		</div>
	);
}
