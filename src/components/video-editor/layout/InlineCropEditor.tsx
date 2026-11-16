import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CaretDown } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useI18n } from "@/contexts/I18nContext";
import { type CropHandle, dragCrop, fitCropRatio, parseCropRatio } from "../cropGeometry";
import type { CropRegion } from "../types";
import { RatioTile } from "./AspectRatioPicker";

const HANDLES: Array<Exclude<CropHandle, "move">> = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
const HANDLE_NAMES: Record<Exclude<CropHandle, "move">, string> = {
	n: "Top edge",
	s: "Bottom edge",
	e: "Right edge",
	w: "Left edge",
	nw: "Top left corner",
	ne: "Top right corner",
	sw: "Bottom left corner",
	se: "Bottom right corner",
};
const RATIO_PRESETS: Array<[width: string, height: string]> = [
	["1", "1"],
	["16", "9"],
	["9", "16"],
	["4", "3"],
];
const FULL_FRAME: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	videoElement: HTMLVideoElement | null;
	cropRegion: CropRegion;
	onCropChange: (crop: CropRegion) => void;
	onCancel: () => void;
	onDone: () => void;
	/** Leaves the same room at the sides as the preview does for the annotation strip. */
	besideTools: boolean;
};

/** The whole recorded frame with the crop drawn on it; everything outside the crop is dimmed. */
function CropSurface({
	t,
	videoElement,
	cropRegion,
	onCropChange,
	lockedRatio,
	sourceRatio,
}: Pick<Props, "t" | "videoElement" | "cropRegion" | "onCropChange"> & {
	lockedRatio: number | null;
	sourceRatio: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const surfaceRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		handle: CropHandle;
		x: number;
		y: number;
		crop: CropRegion;
		dx: number;
		dy: number;
	} | null>(null);
	const maskId = useId();

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d", { alpha: false });
		if (!videoElement || !canvas || !ctx) return;
		let frame = 0;
		let drawnTime = -1;
		const draw = () => {
			const { videoWidth, videoHeight } = videoElement;
			if (
				videoElement.readyState >= 2 &&
				videoWidth > 0 &&
				videoHeight > 0 &&
				(drawnTime !== videoElement.currentTime ||
					canvas.width !== videoWidth ||
					canvas.height !== videoHeight)
			) {
				if (canvas.width !== videoWidth) canvas.width = videoWidth;
				if (canvas.height !== videoHeight) canvas.height = videoHeight;
				ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
				drawnTime = videoElement.currentTime;
			}
			frame = requestAnimationFrame(draw);
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, [videoElement]);

	// Pressing or releasing Shift mid-drag switches to a square and back without moving the mouse.
	useEffect(() => {
		const snap = (event: KeyboardEvent) => {
			const active = drag.current;
			if (event.key !== "Shift" || !active) return;
			onCropChange(
				dragCrop(
					active.crop,
					active.handle,
					active.dx,
					active.dy,
					event.type === "keydown" ? 1 : lockedRatio,
					sourceRatio,
				),
			);
		};
		window.addEventListener("keydown", snap);
		window.addEventListener("keyup", snap);
		return () => {
			window.removeEventListener("keydown", snap);
			window.removeEventListener("keyup", snap);
		};
	}, [onCropChange, lockedRatio, sourceRatio]);

	const start = (event: PointerEvent<HTMLDivElement>, handle: CropHandle) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		drag.current = {
			handle,
			x: event.clientX,
			y: event.clientY,
			crop: cropRegion,
			dx: 0,
			dy: 0,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const move = (event: PointerEvent) => {
		const active = drag.current;
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!active || !rect?.width || !rect.height) return;
		active.dx = (event.clientX - active.x) / rect.width;
		active.dy = (event.clientY - active.y) / rect.height;
		onCropChange(
			dragCrop(
				active.crop,
				active.handle,
				active.dx,
				active.dy,
				event.shiftKey ? 1 : lockedRatio,
				sourceRatio,
			),
		);
	};
	const stop = () => {
		drag.current = null;
	};
	const box = {
		left: `${cropRegion.x * 100}%`,
		top: `${cropRegion.y * 100}%`,
		width: `${cropRegion.width * 100}%`,
		height: `${cropRegion.height * 100}%`,
	};

	return (
		<div
			ref={surfaceRef}
			data-testid="crop-surface"
			className="relative select-none bg-black"
			style={{
				width: `min(100cqw, calc(100cqh * ${sourceRatio}))`,
				height: `min(100cqh, calc(100cqw / ${sourceRatio}))`,
				touchAction: "none",
			}}
			onPointerMove={move}
			onPointerUp={stop}
			onPointerCancel={stop}
			onLostPointerCapture={stop}
		>
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			<svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
				<defs>
					<mask id={maskId}>
						<rect width="100%" height="100%" fill="white" />
						<rect
							x={box.left}
							y={box.top}
							width={box.width}
							height={box.height}
							fill="black"
						/>
					</mask>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill="black"
					fillOpacity="0.6"
					mask={`url(#${maskId})`}
				/>
			</svg>
			<div
				data-testid="crop-selection"
				title={t("settings.crop.move", "Move crop")}
				className="absolute cursor-move border-2 border-accent"
				style={box}
				onPointerDown={(event) => start(event, "move")}
			>
				{[1, 2].map((line) => (
					<div key={line} className="pointer-events-none absolute inset-0">
						<div
							className="absolute h-full border-l border-white/30"
							style={{ left: `${(line * 100) / 3}%` }}
						/>
						<div
							className="absolute w-full border-t border-white/30"
							style={{ top: `${(line * 100) / 3}%` }}
						/>
					</div>
				))}
				{HANDLES.map((handle) => {
					const corner = handle.length === 2;
					const horizontal = handle === "n" || handle === "s";
					return (
						<div
							key={handle}
							data-crop-handle={handle}
							title={t(`settings.crop.handle.${handle}`, HANDLE_NAMES[handle])}
							className="absolute z-10"
							style={{
								left: handle.includes("w")
									? 0
									: handle.includes("e")
										? "100%"
										: "50%",
								top: handle.includes("n")
									? 0
									: handle.includes("s")
										? "100%"
										: "50%",
								width: horizontal ? "calc(100% - 20px)" : 20,
								height: !corner && !horizontal ? "calc(100% - 20px)" : 20,
								transform: "translate(-50%, -50%)",
								cursor: `${handle}-resize`,
							}}
							onPointerDown={(event) => start(event, handle)}
						>
							<span
								className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_3px_rgb(0_0_0/0.4)]"
								style={{
									width: corner ? 10 : horizontal ? 24 : 4,
									height: corner ? 10 : horizontal ? 4 : 24,
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Cropping in place of the preview: the full frame with handles on it, and the crop's own bar
 * where the aspect ratio and Crop buttons normally sit. It edits the same crop the export uses.
 */
export function InlineCropEditor({
	t,
	videoElement,
	cropRegion,
	onCropChange,
	onCancel,
	onDone,
	besideTools,
}: Props) {
	const root = useRef<HTMLDivElement>(null);
	const [ratio, setRatio] = useState<{ value: number; label: string } | null>(null);
	const [ratioWidth, setRatioWidth] = useState("16");
	const [ratioHeight, setRatioHeight] = useState("9");
	const sourceRatio = (videoElement?.videoWidth || 1920) / (videoElement?.videoHeight || 1080);
	const title = t("settings.crop.title");
	const freeLabel = t("settings.crop.freeform", "Free");
	const shapeLabel = t("settings.crop.shape", "Crop shape");
	const typedRatio = parseCropRatio(ratioWidth, ratioHeight);

	useEffect(() => {
		root.current?.focus({ preventScroll: true });
	}, []);

	// Escape and Enter work wherever the focus is, except while typing or inside a menu.
	const keys = useRef({ onCancel, onDone });
	keys.current = { onCancel, onDone };
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			if (event.key !== "Escape" && event.key !== "Enter") return;
			const target = event.target instanceof HTMLElement ? event.target : null;
			const inCrop = Boolean(target && root.current?.contains(target));
			if (
				target?.closest(
					'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]',
				) ||
				(!inCrop && target?.closest('[role="dialog"], [role="alertdialog"]'))
			)
				return;
			if (event.key === "Enter" && target?.closest("button, a, [role='button']")) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") keys.current.onCancel();
			else keys.current.onDone();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	function lockRatio(widthText: string, heightText: string) {
		setRatioWidth(widthText);
		setRatioHeight(heightText);
		const value = parseCropRatio(widthText, heightText);
		if (value === null) return;
		setRatio({ value, label: `${widthText.trim()}:${heightText.trim()}` });
		onCropChange(fitCropRatio(cropRegion, value, sourceRatio));
	}

	return (
		<div
			ref={root}
			tabIndex={-1}
			data-inline-crop=""
			role="dialog"
			aria-label={title}
			className="absolute inset-0 z-30 flex flex-col outline-none"
		>
			<div className="flex h-10 shrink-0 items-center justify-center gap-3">
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="gap-1 px-2 text-xs"
							aria-label={`${shapeLabel}: ${ratio?.label ?? freeLabel}`}
						>
							<span className="font-medium">{ratio?.label ?? freeLabel}</span>
							<CaretDown className="h-3 w-3" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						sideOffset={6}
						aria-label={shapeLabel}
						className="w-[304px] p-3"
					>
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-2 text-[11px] font-medium text-muted">
									<Input
										aria-label={t("settings.crop.ratioWidth", "Ratio width")}
										aria-invalid={typedRatio === null}
										inputMode="decimal"
										className="h-8 w-full min-w-0 flex-1 text-[13px] tabular-nums"
										value={ratioWidth}
										onChange={(event) =>
											lockRatio(
												event.target.value.replace(/[^\d.]/g, ""),
												ratioHeight,
											)
										}
									/>
									<span aria-hidden="true">:</span>
									<Input
										aria-label={t("settings.crop.ratioHeight", "Ratio height")}
										aria-invalid={typedRatio === null}
										inputMode="decimal"
										className="h-8 w-full min-w-0 flex-1 text-[13px] tabular-nums"
										value={ratioHeight}
										onChange={(event) =>
											lockRatio(
												ratioWidth,
												event.target.value.replace(/[^\d.]/g, ""),
											)
										}
									/>
								</div>
								{typedRatio === null ? (
									<p role="alert" className="text-[11px] text-danger">
										{t(
											"settings.crop.ratioRange",
											"Enter a shape between 1:20 and 20:1.",
										)}
									</p>
								) : null}
							</div>
							<div
								role="radiogroup"
								aria-label={shapeLabel}
								className="grid grid-cols-5 gap-1"
							>
								<RatioTile
									ratio={sourceRatio}
									dashed
									label={freeLabel}
									selected={ratio === null}
									onSelect={() => setRatio(null)}
								/>
								{RATIO_PRESETS.map(([width, height]) => (
									<RatioTile
										key={`${width}:${height}`}
										ratio={Number(width) / Number(height)}
										label={`${width}:${height}`}
										selected={ratio?.label === `${width}:${height}`}
										onSelect={() => lockRatio(width, height)}
									/>
								))}
							</div>
						</div>
					</PopoverContent>
				</Popover>
				<div className="h-4 w-px bg-foreground/20" />
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="px-2 text-xs"
						onClick={() => {
							setRatio(null);
							onCropChange(FULL_FRAME);
						}}
					>
						<span className="font-medium">{t("common.actions.reset", "Reset")}</span>
					</Button>
					<Button variant="ghost" size="sm" className="px-2 text-xs" onClick={onCancel}>
						<span className="font-medium">{t("common.actions.cancel", "Cancel")}</span>
					</Button>
					<Button size="sm" className="px-3 text-xs" onClick={onDone}>
						<span className="font-medium">{t("common.actions.done", "Done")}</span>
					</Button>
				</div>
			</div>
			<div
				className={`flex min-h-0 w-full flex-1 flex-col px-4 py-3${besideTools ? " editor-preview-area--tools" : ""}`}
			>
				<div
					className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
					style={{ containerType: "size" }}
				>
					<CropSurface
						t={t}
						videoElement={videoElement}
						cropRegion={cropRegion}
						onCropChange={onCropChange}
						lockedRatio={ratio?.value ?? null}
						sourceRatio={sourceRatio}
					/>
				</div>
				<p className="shrink-0 pt-3 text-center text-[11px] text-muted-foreground">
					{t(
						"settings.crop.inlineHint",
						"Drag edges or corners · Hold Shift for a square · Enter to apply, Esc to cancel",
					)}
				</p>
			</div>
		</div>
	);
}
