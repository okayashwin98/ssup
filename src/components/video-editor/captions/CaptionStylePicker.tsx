import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChoiceGroup, ChoiceItem } from "@/components/ui/choice-group";
import { buildActiveCaptionLayout } from "../captionLayout";
import {
	CAPTION_PRESETS,
	getCaptionDisplayText,
	getCaptionFontWeight,
	getCaptionOutlineEm,
	getCaptionPreset,
	getCaptionRevealBlurPx,
} from "../captionPresets";
import { CAPTION_LINE_HEIGHT, getCaptionPadding, getCaptionScaledRadius } from "../captionStyle";
import { type AutoCaptionStyle, DEFAULT_AUTO_CAPTION_SETTINGS } from "../types";
import { useCaptionFont } from "../useCaptionFont";

const SAMPLE_FONT_SIZE = 11;
const SAMPLE_LOOP_MS = 2200;
const SAMPLE = [
	{
		id: "style-preview",
		startMs: 0,
		endMs: 1900,
		text: "Make it clear",
		words: [
			{ text: "Make", startMs: 80, endMs: 440 },
			{ text: "it", startMs: 500, endMs: 800, leadingSpace: true },
			{ text: "clear", startMs: 900, endMs: 1800, leadingSpace: true },
		],
	},
];

function CaptionStylePreview({ style, playing }: { style: AutoCaptionStyle; playing: boolean }) {
	const stage = useRef<HTMLSpanElement>(null);
	const [stageWidth, setStageWidth] = useState(0);
	const [time, setTime] = useState(1500);
	useEffect(() => {
		const node = stage.current;
		if (!node) return;
		const observer = new ResizeObserver(() => setStageWidth(node.clientWidth));
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	const settings = useMemo(
		() => ({ ...DEFAULT_AUTO_CAPTION_SETTINGS, ...getCaptionPreset(style).settings, style }),
		[style],
	);
	// The TikTok card loads its bundled font only when the picker is shown.
	const { fontFamily, ready } = useCaptionFont(settings);
	useEffect(() => {
		if (!playing) {
			setTime(1500);
			return;
		}
		let frame = 0;
		const start = performance.now();
		const animate = (now: number) => {
			setTime((now - start) % SAMPLE_LOOP_MS);
			frame = requestAnimationFrame(animate);
		};
		frame = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(frame);
	}, [playing]);
	const fontWeight = getCaptionFontWeight(style);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Re-measure once the bundled font has loaded.
	const { layout, fontSize } = useMemo(() => {
		const context = document.createElement("canvas").getContext("2d");
		if (!context) return { layout: null, fontSize: SAMPLE_FONT_SIZE };
		const build = (size: number, timeMs: number) => {
			context.font = `${fontWeight} ${size}px ${fontFamily}`;
			return buildActiveCaptionLayout({
				cues: SAMPLE,
				timeMs,
				settings,
				maxWidthPx: 1000,
				measureText: (text) => context.measureText(text).width,
			});
		};
		// The whole sample, box included, fits the card; wide styles get a smaller size.
		const fullWidth = build(SAMPLE_FONT_SIZE, 1500)?.visibleLines[0]?.width ?? 0;
		const boxWidth = fullWidth + getCaptionPadding(SAMPLE_FONT_SIZE).x * 1.2;
		const size =
			stageWidth > 0 && boxWidth > stageWidth - 8
				? Math.max(6, (SAMPLE_FONT_SIZE * (stageWidth - 8)) / boxWidth)
				: SAMPLE_FONT_SIZE;
		return { layout: build(size, time), fontSize: size };
	}, [fontFamily, fontWeight, settings, time, ready, stageWidth]);
	const padding = getCaptionPadding(fontSize);
	const outlineEm = getCaptionOutlineEm(style);
	return (
		<span
			ref={stage}
			aria-hidden="true"
			data-caption-style-preview={style}
			className="flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-[#2b2b2b]"
		>
			{layout && (
				<span
					style={{
						fontFamily,
						fontSize,
						fontWeight,
						lineHeight: CAPTION_LINE_HEIGHT,
						whiteSpace: "nowrap",
						padding: `${padding.y * 0.6}px ${padding.x * 0.6}px`,
						background: `rgba(0, 0, 0, ${settings.backgroundOpacity})`,
						color: settings.textColor,
						borderRadius: getCaptionScaledRadius(settings.boxRadius, fontSize),
					}}
				>
					{layout.visibleLines[0]?.words.map((word) => {
						const blur = getCaptionRevealBlurPx(word.revealProgress, fontSize);
						return (
							<span
								key={word.index}
								style={{
									display: "inline-block",
									whiteSpace: "pre",
									opacity: word.revealProgress ?? 1,
									filter: blur > 0 ? `blur(${blur}px)` : undefined,
									WebkitTextStroke:
										outlineEm > 0 ? `${outlineEm}em #000000` : undefined,
									paintOrder: outlineEm > 0 ? "stroke fill" : undefined,
								}}
							>
								{`${word.leadingSpace ? " " : ""}${getCaptionDisplayText(word.text, style)}`}
							</span>
						);
					})}
				</span>
			)}
		</span>
	);
}

/** Classic, Reveal and TikTok, each with a small sample; Reveal plays on hover. */
export function CaptionStylePicker({
	value,
	onChange,
	label,
	getLabel,
}: {
	value: AutoCaptionStyle | undefined;
	onChange: (style: AutoCaptionStyle) => void;
	label: string;
	getLabel: (style: AutoCaptionStyle, fallback: string) => string;
}) {
	const reducedMotion = useReducedMotion();
	const [hovered, setHovered] = useState<AutoCaptionStyle | null>(null);
	return (
		<ChoiceGroup
			type="single"
			value={getCaptionPreset(value).id}
			onValueChange={(next) => {
				const preset = CAPTION_PRESETS.find((option) => option.id === next);
				if (preset) onChange(preset.id);
			}}
			className="grid grid-cols-3 gap-2"
			aria-label={label}
		>
			{CAPTION_PRESETS.map((preset) => {
				const name = getLabel(preset.id, preset.label);
				return (
					<ChoiceItem
						key={preset.id}
						value={preset.id}
						aria-label={name}
						title={name}
						className="h-auto min-w-0 flex-col gap-1.5 p-1.5"
						onHoverStart={() => setHovered(preset.id)}
						onHoverEnd={() => setHovered(null)}
					>
						<CaptionStylePreview
							style={preset.id}
							playing={!reducedMotion && hovered === preset.id}
						/>
						<span className="pb-0.5 text-xs">{name}</span>
					</ChoiceItem>
				);
			})}
		</ChoiceGroup>
	);
}
