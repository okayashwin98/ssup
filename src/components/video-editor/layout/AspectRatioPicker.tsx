import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CaretDown } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import {
	type AspectRatio,
	CUSTOM_SIZE_MAX,
	CUSTOM_SIZE_MIN,
	customSizeToAspectRatio,
	getAspectRatioFrameSize,
	getAspectRatioShortLabel,
	getAspectRatioValue,
	isValidCustomSide,
} from "@/utils/aspectRatioUtils";

/** Widest to tallest. Every ratio the old dropdown offered is here, 16:10 and 10:16 included. */
const RATIOS: AspectRatio[] = [
	"native",
	"3:1",
	"16:9",
	"16:10",
	"3:2",
	"4:3",
	"5:4",
	"1:1",
	"4:5",
	"3:4",
	"2:3",
	"10:16",
	"9:16",
];

/** One choice in a grid of shapes: the outline drawn to scale, with its ratio underneath. */
export function RatioTile({
	ratio,
	label,
	name,
	dashed = false,
	selected,
	onSelect,
}: {
	/** Width / height of the outline. */
	ratio: number;
	label: string;
	/** What the shape is for, shown above the ratio. */
	name?: string;
	dashed?: boolean;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={name ? `${name} ${label}` : label}
			onClick={onSelect}
			className={cn(
				"flex min-w-0 flex-col items-center gap-1.5 rounded-[10px] px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
				selected
					? "bg-default/70 text-foreground"
					: "text-muted hover:bg-default/40 hover:text-foreground",
			)}
		>
			<span className="flex size-6 items-center justify-center" aria-hidden="true">
				<span
					className={cn(
						"rounded-[3px] border-[1.5px]",
						dashed && "border-dashed",
						selected ? "border-accent" : "border-current",
					)}
					style={{
						aspectRatio: ratio,
						width: ratio >= 1 ? "100%" : undefined,
						height: ratio < 1 ? "100%" : undefined,
					}}
				/>
			</span>
			<span className="flex max-w-full flex-col items-center text-[11px] leading-[14px]">
				{name ? <span className="max-w-full truncate">{name}</span> : null}
				<span className={cn("tabular-nums", name && "text-[10px] opacity-70")}>
					{label}
				</span>
			</span>
		</button>
	);
}

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	value: AspectRatio;
	onChange: (value: AspectRatio) => void;
	/** Read when the picker opens, so the size fields start from the real video. */
	getSourceSize: () => { width: number; height: number } | null;
};

export function AspectRatioPicker({ t, value, onChange, getSourceSize }: Props) {
	const [open, setOpen] = useState(false);
	const [source, setSource] = useState({ width: 1920, height: 1080 });
	const [width, setWidth] = useState("");
	const [height, setHeight] = useState("");
	const nativeLabel = t("editor.aspectRatio.native", "Native");
	const title = t("editor.aspectRatio.title", "Aspect ratio");
	const label = value === "native" ? nativeLabel : getAspectRatioShortLabel(value);
	const sizeInvalid =
		(width !== "" && !isValidCustomSide(width)) ||
		(height !== "" && !isValidCustomSide(height));

	function showSize(ratio: AspectRatio, size = source) {
		const frame = getAspectRatioFrameSize(ratio, size.width, size.height);
		setWidth(String(frame.width));
		setHeight(String(frame.height));
	}

	function choose(ratio: AspectRatio) {
		onChange(ratio);
		showSize(ratio);
	}

	function typeSize(nextWidth: string, nextHeight: string) {
		setWidth(nextWidth);
		setHeight(nextHeight);
		const ratio = customSizeToAspectRatio(nextWidth, nextHeight);
		if (ratio) onChange(ratio);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (next) {
					const size = getSourceSize();
					const nextSource = size && size.width > 0 && size.height > 0 ? size : source;
					setSource(nextSource);
					showSize(value, nextSource);
				}
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1 px-2 text-xs"
					aria-label={`${title}: ${label}`}
				>
					<span className="font-medium">{label}</span>
					<CaretDown className="h-3 w-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent sideOffset={6} aria-label={title} className="w-[304px] p-3">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-2">
							{(
								[
									["W", t("common.width", "Width"), width, 0],
									["H", t("common.height", "Height"), height, 1],
								] as const
							).map(([short, name, text, index]) => (
								<label
									key={short}
									className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-medium text-muted"
								>
									<span aria-hidden="true">{short}</span>
									<Input
										aria-label={name}
										aria-invalid={text !== "" && !isValidCustomSide(text)}
										inputMode="numeric"
										className="w-full min-w-0 text-[13px] tabular-nums"
										value={text}
										onChange={(event) => {
											const next = event.target.value.replace(/[^\d]/g, "");
											typeSize(
												index === 0 ? next : width,
												index === 1 ? next : height,
											);
										}}
									/>
								</label>
							))}
						</div>
						{sizeInvalid ? (
							<p role="alert" className="text-[11px] text-danger">
								{t(
									"editor.aspectRatio.sizeRange",
									"Enter whole numbers from {{min}} to {{max}}.",
									{ min: CUSTOM_SIZE_MIN, max: CUSTOM_SIZE_MAX },
								)}
							</p>
						) : null}
					</div>
					<div
						role="radiogroup"
						aria-label={t("editor.aspectRatio.presets", "Aspect ratio presets")}
						className="grid grid-cols-4 gap-1"
					>
						{RATIOS.map((ratio) => (
							<RatioTile
								key={ratio}
								ratio={getAspectRatioValue(ratio, source.width / source.height)}
								dashed={ratio === "native"}
								label={ratio === "native" ? nativeLabel : ratio}
								selected={value === ratio}
								onSelect={() => choose(ratio)}
							/>
						))}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
