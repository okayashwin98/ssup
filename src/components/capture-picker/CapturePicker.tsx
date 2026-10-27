import type {
	CSSProperties,
	MouseEvent as ReactMouseEvent,
	ReactNode,
	PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	AREA_HANDLES,
	type AreaHandle,
	type AreaRect,
	frontmostAt,
	MIN_AREA_SIZE,
	moveAreaRect,
	normalizeAreaRect,
	rectContains,
	resizeAreaRect,
} from "./areaGeometry";
import { swayPhase } from "./hoverSway";

type Target =
	| { kind: "window"; window: CapturePickerWindow; rect: AreaRect }
	| { kind: "screen"; rect: AreaRect }
	| { kind: "area"; rect: AreaRect };

type PickerContext = Awaited<ReturnType<typeof window.electronAPI.getCapturePickerContext>>;

// Screen Studio's Resize presets: common sizes, then sizes grouped by aspect ratio.
const RESIZE_PRESETS: Array<[number, number]> = [
	[1280, 720],
	[1920, 1080],
	[2560, 1440],
];
const RESIZE_GROUPS: Array<{ label: string; sizes: Array<[number, number]> }> = [
	{
		label: "4:3",
		sizes: [
			[640, 480],
			[800, 600],
			[1024, 768],
			[1280, 960],
			[1600, 1200],
		],
	},
	{
		label: "9:16",
		sizes: [
			[540, 960],
			[720, 1280],
			[1080, 1920],
		],
	},
	{
		label: "16:10",
		sizes: [
			[1280, 800],
			[1440, 900],
			[1680, 1050],
			[1920, 1200],
		],
	},
	{
		label: "Square",
		sizes: [
			[600, 600],
			[800, 800],
			[1080, 1080],
		],
	},
];
// Aspect ratios for a typed area, kept around its centre.
const AREA_RATIOS: Array<{ label: string; ratio: number | null }> = [
	{ label: "Free", ratio: null },
	{ label: "16:9", ratio: 16 / 9 },
	{ label: "4:3", ratio: 4 / 3 },
	{ label: "1:1", ratio: 1 },
	{ label: "9:16", ratio: 9 / 16 },
];

// Everything that is not the hovered target sits under this dim.
const DIM = "rgba(0,0,0,0.6)";
// The hovered screen or window is tinted in the Start recording button's colour.
const HIGHLIGHT = "rgba(var(--brand-accent-rgb), 0.28)";

function screenRect() {
	return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

/**
 * A size kept around the rectangle's centre and inside the screen. With a locked
 * `ratio`, a size too big for the screen shrinks as a whole so the shape holds.
 */
function resizeAroundCentre(
	rect: AreaRect,
	width: number,
	height: number,
	ratio?: number | null,
): AreaRect {
	const bounds = screenRect();
	if (ratio) {
		const fit = Math.min(1, bounds.width / width, bounds.height / height);
		width *= fit;
		height *= fit;
	}
	const w = Math.min(Math.max(Math.round(width), MIN_AREA_SIZE), bounds.width);
	const h = Math.min(Math.max(Math.round(height), MIN_AREA_SIZE), bounds.height);
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	return {
		x: Math.round(Math.min(Math.max(cx - w / 2, 0), bounds.width - w)),
		y: Math.round(Math.min(Math.max(cy - h / 2, 0), bounds.height - h)),
		width: w,
		height: h,
	};
}

// The area's control card is about 270 × 125 pt; this keeps it clear of the edges.
const AREA_CARD_ROOM = { width: 300, height: 150 };

/** Where the area's control card goes, relative to the area, so it stays on screen. */
function areaCardPlacement(rect: AreaRect): CSSProperties {
	const bounds = screenRect();
	const half = AREA_CARD_ROOM.width / 2;
	const centre = Math.min(
		Math.max(rect.x + rect.width / 2, half),
		Math.max(half, bounds.width - half),
	);
	const left = centre - rect.x;
	if (rect.y + rect.height + AREA_CARD_ROOM.height <= bounds.height) {
		return { left, top: "calc(100% + 12px)", transform: "translateX(-50%)" };
	}
	if (rect.y >= AREA_CARD_ROOM.height) {
		return { left, bottom: "calc(100% + 12px)", transform: "translateX(-50%)" };
	}
	return { left, bottom: 16, transform: "translateX(-50%)" };
}

/** The dashboard's Capture button, in the app's theme colour, a size up. */
function StartButton({ onStart }: { onStart: () => void }) {
	return (
		// Presses here mustn't reach the picker, which would pick or start drawing.
		<span
			className="pointer-events-auto mt-2"
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
		>
			<Button
				variant="default"
				className="h-11 px-6 text-[15px] shadow-lg"
				style={{ textShadow: "none" }}
				onClick={onStart}
			>
				Start recording
			</Button>
		</span>
	);
}

function SmallButton({
	children,
	onClick,
	label,
	glass = false,
}: {
	children: ReactNode;
	onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	label?: string;
	/** Sits on Liquid Glass (macOS 26+), which the app places under it. */
	glass?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			data-glass={glass || undefined}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			// Without glass, a dark fill keeps the label readable over any window content (a
			// page blur cannot see through these see-through windows). One height for all.
			className={`pointer-events-auto inline-flex h-8 items-center rounded-lg px-2.5 text-sm leading-none text-white ${
				glass
					? "hover:bg-white/15"
					: "border border-white/15 bg-neutral-900/80 hover:bg-neutral-800/80"
			}`}
			style={{ textShadow: "none" }}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

/**
 * Chooses a source, like Screen Studio: Display, Window or Area mode (or all of them
 * at once). The target under the pointer shows its name, size and Start recording.
 */
export function CapturePicker() {
	const displayId = Number(new URLSearchParams(window.location.search).get("displayId"));
	const [target, setTarget] = useState<Target | null>(null);
	const [allowArea, setAllowArea] = useState(false);
	const [mode, setMode] = useState<CapturePickerMode | undefined>(undefined);
	const [display, setDisplay] = useState<{
		name?: string;
		refreshRate?: number;
		scaleFactor?: number;
	}>({});
	const [hasWindows, setHasWindows] = useState(true);
	const [areaRatio, setAreaRatio] = useState<number | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	// Display mode shows every screen; the one under the pointer is also highlighted.
	const [pointerHere, setPointerHere] = useState(false);
	// Where the pointer last was on this screen; null once it leaves.
	const lastPointer = useRef<{ x: number; y: number } | null>(null);
	const windows = useRef<{ window: CapturePickerWindow; rect: AreaRect }[]>([]);
	const origin = useRef({ x: window.screenX, y: window.screenY });
	const current = useRef<Target | null>(null);
	const modeRef = useRef<CapturePickerMode | undefined>(undefined);
	const press = useRef<{
		x: number;
		y: number;
		drawing: boolean;
		rect?: AreaRect;
		handle?: AreaHandle;
	} | null>(null);
	const editingArea = useRef(false);
	// The Start recording card hides while an area is drawn; this shows it once the drag ends.
	const [, redraw] = useReducer((count: number) => count + 1, 0);
	const completed = useRef(false);
	const canDraw = mode === "area" || (mode === undefined && allowArea);
	// Liquid Glass under buttons marked data-glass: the app places it by their on-screen
	// boxes, re-sent whenever they move (once a card's entrance animation ends too).
	// Off for good if placing the glass ever fails, so the buttons get their fill back.
	const [onGlass, setOnGlass] = useState(
		() => window.electronAPI?.capturePickerHasGlass?.() === true,
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const sentGlass = useRef("[]");
	const syncGlass = useCallback(() => {
		if (!onGlass) return;
		const rects = [
			...(rootRef.current?.querySelectorAll<HTMLElement>("[data-glass]") ?? []),
		].map((element) => {
			const box = element.getBoundingClientRect();
			return {
				x: Math.round(box.left),
				y: Math.round(box.top),
				width: Math.round(box.width),
				height: Math.round(box.height),
				radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
			};
		});
		const sent = JSON.stringify(rects);
		if (sent === sentGlass.current) return;
		sentGlass.current = sent;
		if (!window.electronAPI.capturePickerSetGlassRects(rects) && rects.length) setOnGlass(false);
	}, [onGlass]);
	useLayoutEffect(syncGlass);

	const toLocal = (area: CaptureArea): AreaRect =>
		normalizeAreaRect(
			{ ...area, x: area.x - origin.current.x, y: area.y - origin.current.y },
			screenRect(),
		);

	const targetAt = useCallback((x: number, y: number): Target | null => {
		if (modeRef.current === "area") return null;
		if (modeRef.current === "display") return { kind: "screen", rect: screenRect() };
		const hit = frontmostAt(windows.current, x, y);
		if (hit) return { kind: "window", window: hit.window, rect: hit.rect };
		return modeRef.current === "window" ? null : { kind: "screen", rect: screenRect() };
	}, []);
	const update = (next: Target | null) => {
		const previous = current.current;
		if (
			next &&
			previous?.kind === next.kind &&
			(previous.kind !== "window" ||
				(next.kind === "window" && previous.window.id === next.window.id)) &&
			previous.rect.x === next.rect.x &&
			previous.rect.y === next.rect.y &&
			previous.rect.width === next.rect.width &&
			previous.rect.height === next.rect.height
		)
			return;
		if (!next && !previous) return;
		// A Resize error belongs to the window it was for.
		if (
			next?.kind !== "window" ||
			previous?.kind !== "window" ||
			next.window.id !== previous.window.id
		)
			setMessage(null);
		current.current = next;
		setTarget(next);
	};
	const finish = useCallback(
		(pick: Target | null, record = false) => {
			if (completed.current) return;
			if (
				pick?.kind === "area" &&
				(pick.rect.width < MIN_AREA_SIZE || pick.rect.height < MIN_AREA_SIZE)
			)
				return;
			completed.current = true;
			const common = { displayId, record };
			void window.electronAPI.completeCapturePick(
				!pick
					? null
					: pick.kind === "window"
						? { ...common, kind: "window", windowId: pick.window.id }
						: pick.kind === "screen"
							? { ...common, kind: "screen" }
							: {
									...common,
									kind: "area",
									...pick.rect,
									x: origin.current.x + pick.rect.x,
									y: origin.current.y + pick.rect.y,
								},
			);
		},
		[displayId],
	);
	useEffect(() => {
		let disposed = false;
		void window.electronAPI
			.getCapturePickerContext(displayId)
			.then((context: PickerContext) => {
				if (disposed) return;
				if (context.displayBounds) origin.current = context.displayBounds;
				setAllowArea(context.allowArea === true);
				modeRef.current = context.mode;
				setMode(context.mode);
				setDisplay({
					name: context.displayName,
					refreshRate: context.refreshRate,
					scaleFactor: context.scaleFactor,
				});
				windows.current = context.windows
					.map((entry) => ({
						window: entry,
						rect: normalizeAreaRect(
							{
								...entry,
								x: entry.x - origin.current.x,
								y: entry.y - origin.current.y,
							},
							screenRect(),
						),
					}))
					.filter((entry) => entry.rect.width > 0 && entry.rect.height > 0);
				setHasWindows(windows.current.length > 0);
				// Display mode offers every screen at once; otherwise only the screen under
				// the pointer shows its target and Start recording.
				const local = context.cursor
					? {
							x: context.cursor.x - origin.current.x,
							y: context.cursor.y - origin.current.y,
						}
					: null;
				const next =
					context.mode === "display"
						? { kind: "screen" as const, rect: screenRect() }
						: local && rectContains(screenRect(), local.x, local.y)
							? targetAt(local.x, local.y)
							: null;
				current.current = next;
				editingArea.current = false;
				setTarget(next);
				const here = !!local && rectContains(screenRect(), local.x, local.y);
				setPointerHere(here);
				lastPointer.current = here ? local : null;
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (!disposed) window.electronAPI.capturePickerReady();
					}),
				);
			})
			.catch(() => {
				if (!disposed) finish(null);
			});
		return () => {
			disposed = true;
		};
	}, [displayId, targetAt, finish]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
			if (event.key === "Escape") {
				event.preventDefault();
				finish(null);
			}
			if (event.key === "Enter") {
				event.preventDefault();
				if (current.current) finish(current.current, true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [finish]);

	// The bar's Display, Window and Area buttons switch modes while the picker is open.
	useEffect(
		() =>
			window.electronAPI.onCapturePickerModeChanged((next) => {
				modeRef.current = next;
				setMode(next);
				press.current = null;
				editingArea.current = false;
				setAreaRatio(null);
				const pointer = lastPointer.current;
				const target =
					next === "display"
						? { kind: "screen" as const, rect: screenRect() }
						: pointer
							? targetAt(pointer.x, pointer.y)
							: null;
				current.current = target;
				setTarget(target);
			}),
		[targetAt],
	);

	// App icons arrive after the picker opens; a hovered window's card picks its up.
	useEffect(
		() =>
			window.electronAPI.onCapturePickerIcons((icons) => {
				for (const entry of windows.current) {
					const icon = icons[entry.window.id];
					if (icon) entry.window = { ...entry.window, appIcon: icon };
				}
				const shown = current.current;
				if (shown?.kind !== "window" || !icons[shown.window.id]) return;
				const next = {
					...shown,
					window: { ...shown.window, appIcon: icons[shown.window.id] },
				};
				current.current = next;
				setTarget(next);
			}),
		[],
	);

	const editArea = (rect: AreaRect) => {
		press.current = null;
		editingArea.current = true;
		update({ kind: "area", rect });
		redraw();
	};

	const openResizeMenu = async (
		event: ReactMouseEvent<HTMLButtonElement>,
		windowTarget: CapturePickerWindow,
	) => {
		const bounds = screenRect();
		const fits = ([w, h]: [number, number]) => w <= bounds.width && h <= bounds.height;
		const item = (size: [number, number]) => ({
			id: `${size[0]}x${size[1]}`,
			label: `${size[0]} × ${size[1]}`,
			enabled: fits(size),
		});
		const rect = event.currentTarget.getBoundingClientRect();
		const choice = await window.electronAPI.hudShowMenu({
			x: rect.left,
			y: rect.bottom + 4,
			above: rect.top - 4,
			items: [
				...RESIZE_PRESETS.map(item),
				{ type: "separator" },
				...RESIZE_GROUPS.map((group) => ({
					label: group.label,
					submenu: group.sizes.map(item),
				})),
			],
		});
		if (!choice) return;
		const [width, height] = choice.split("x").map(Number);
		const result = await window.electronAPI.capturePickerResizeWindow(windowTarget.id, {
			width,
			height,
		});
		if (!result.success || !result.frame) {
			setMessage(result.message ?? "This window cannot be resized.");
			return;
		}
		setMessage(null);
		const resized = { ...windowTarget, ...result.frame };
		const local = toLocal(result.frame);
		windows.current = windows.current.map((entry) =>
			entry.window.id === windowTarget.id ? { window: resized, rect: local } : entry,
		);
		update({ kind: "window", window: resized, rect: local });
	};

	const setAreaSize = (width: number, height: number, ratio = areaRatio) => {
		const area = current.current;
		if (area?.kind !== "area") return;
		editArea(resizeAroundCentre(area.rect, width, height, ratio));
	};

	const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!pointerHere) setPointerHere(true);
		lastPointer.current = { x: event.clientX, y: event.clientY };
		const start = press.current;
		if (start?.rect) {
			const dx = event.clientX - start.x;
			const dy = event.clientY - start.y;
			update({
				kind: "area",
				rect: start.handle
					? resizeAreaRect(start.rect, start.handle, dx, dy, screenRect(), areaRatio)
					: moveAreaRect(start.rect, dx, dy, screenRect()),
			});
		} else if (
			start &&
			canDraw &&
			(start.drawing || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4)
		) {
			start.drawing = true;
			editingArea.current = true;
			setAreaRatio(null);
			update({
				kind: "area",
				rect: normalizeAreaRect(
					{
						x: start.x,
						y: start.y,
						width: event.clientX - start.x,
						height: event.clientY - start.y,
					},
					screenRect(),
				),
			});
		} else if (!start && !editingArea.current) update(targetAt(event.clientX, event.clientY));
	};
	const label =
		target?.kind === "window"
			? target.window.appName || target.window.title || "Window"
			: target?.kind === "screen"
				? mode === "display"
					? display.name || "Entire screen"
					: "Entire screen"
				: "Area";
	const areaTooSmall =
		target?.kind === "area" &&
		(target.rect.width < MIN_AREA_SIZE || target.rect.height < MIN_AREA_SIZE);
	const showStartCard =
		target !== null && !press.current?.drawing && !(target.kind === "area" && areaTooSmall);
	// A display shows its real resolution in pixels, as the recording has it (a 5K
	// screen is 5120 × 2880, laid out as 2560 × 1440 points). Windows and areas stay in
	// points, the units the Resize presets and the size fields use.
	const pixels = target?.kind === "screen" && mode === "display" ? (display.scaleFactor ?? 1) : 1;
	const sizeText = target
		? `${Math.round(target.rect.width * pixels)} × ${Math.round(target.rect.height * pixels)}`
		: "";
	return (
		<div
			ref={rootRef}
			onAnimationEnd={syncGlass}
			className="picker-fade-in fixed inset-0 select-none overflow-hidden"
			style={{
				cursor: canDraw ? "crosshair" : "default",
				background: target ? "transparent" : DIM,
			}}
			onPointerMove={onMove}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				const area =
					editingArea.current && current.current?.kind === "area"
						? current.current.rect
						: null;
				const handle = (event.target as HTMLElement).closest<HTMLElement>(
					"[data-area-handle]",
				)?.dataset.areaHandle as AreaHandle | undefined;
				press.current = {
					x: event.clientX,
					y: event.clientY,
					drawing: false,
					...(area && (handle || rectContains(area, event.clientX, event.clientY))
						? { rect: area, handle }
						: {}),
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerUp={(event) => {
				if (event.button !== 0 || !press.current) return;
				const start = press.current;
				press.current = null;
				if (event.currentTarget.hasPointerCapture(event.pointerId))
					event.currentTarget.releasePointerCapture(event.pointerId);
				if (start.drawing || start.rect) {
					redraw();
					return;
				}
				if (editingArea.current) {
					editingArea.current = false;
				}
				const picked = targetAt(event.clientX, event.clientY);
				if (picked) finish(picked);
			}}
			onPointerCancel={() => {
				press.current = null;
			}}
			onPointerLeave={() => {
				setPointerHere(false);
				lastPointer.current = null;
				if (press.current || editingArea.current || modeRef.current === "display") return;
				update(null);
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				finish(null);
			}}
		>
			{target && (
				<div
					className={
						target.kind === "area" && editingArea.current
							? "absolute cursor-move"
							: "pointer-events-none absolute"
					}
					style={{
						left: target.rect.x,
						top: target.rect.y,
						width: target.rect.width,
						height: target.rect.height,
						boxShadow: `0 0 0 100vmax ${DIM}`,
						// A screen stays dimmed (Display mode shows them all); the hovered
						// screen or window gets the highlight tint.
						background:
							target.kind === "screen"
								? mode === "display" && !pointerHere
									? DIM
									: `linear-gradient(${HIGHLIGHT}, ${HIGHLIGHT}), ${DIM}`
								: target.kind === "window"
									? HIGHLIGHT
									: "transparent",
						outline: "1px solid rgba(255,255,255,0.55)",
						outlineOffset: -1,
						borderRadius: target.kind === "window" ? 10 : 0,
						// Glides between hovered windows; an area follows the pointer exactly.
						transition:
							target.kind === "area"
								? undefined
								: "left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease, background 120ms ease",
					}}
				>
					{target.kind === "area" &&
						AREA_HANDLES.map((handle) => {
							const left = handle.includes("w")
								? "0%"
								: handle.includes("e")
									? "100%"
									: "50%";
							const top = handle.includes("n")
								? "0%"
								: handle.includes("s")
									? "100%"
									: "50%";
							return (
								<div
									key={handle}
									data-area-handle={handle}
									className="absolute size-3 rounded-full border border-black/30 bg-white"
									style={{
										left,
										top,
										transform: "translate(-50%, -50%)",
										cursor: `${handle}-resize`,
									}}
								/>
							);
						})}
					{showStartCard && (
						<div
							className="pointer-events-none absolute flex items-center justify-center"
							style={
								// An area's card sits just outside it, so the area itself stays draggable,
								// and always on screen: below, else above, else inside the area's bottom.
								target.kind === "area"
									? areaCardPlacement(target.rect)
									: { inset: 0 }
							}
						>
							<div
								key={target.kind === "window" ? target.window.id : target.kind}
								className={
									// An area's controls sit on a panel of their own, outside the area.
									target.kind === "area"
										? "picker-card-in pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-neutral-900/85 p-4 text-white shadow-2xl backdrop-blur-xl"
										: "picker-card-in flex flex-col items-center gap-2 text-white"
								}
								style={{
									textShadow:
										target.kind === "area"
											? "none"
											: "0 1px 12px rgba(0,0,0,0.55)",
								}}
								onPointerDown={
									target.kind === "area"
										? (event) => event.stopPropagation()
										: undefined
								}
								onPointerUp={
									target.kind === "area"
										? (event) => event.stopPropagation()
										: undefined
								}
							>
								{target.kind === "window" && target.window.appIcon && (
									<img
										src={target.window.appIcon}
										alt=""
										className="hover-sway size-20 drop-shadow-xl"
										style={swayPhase()}
										draggable={false}
									/>
								)}
								{target.kind !== "area" && (
									<div className="text-3xl font-semibold tracking-tight">
										{label}
									</div>
								)}
								<div className="flex items-center gap-2 text-sm tabular-nums opacity-95">
									{target.kind === "area" && editingArea.current ? (
										<AreaSizeFields
											rect={target.rect}
											ratio={areaRatio}
											onSize={setAreaSize}
										/>
									) : (
										<span>
											{sizeText}
											{target.kind === "screen" &&
											mode === "display" &&
											display.refreshRate
												? ` · ${Math.round(display.refreshRate)}FPS`
												: ""}
										</span>
									)}
									{target.kind === "window" && target.window.pid && (
										<SmallButton
											glass={onGlass}
											label="Resize"
											onClick={(event) =>
												void openResizeMenu(event, target.window)
											}
										>
											Resize
										</SmallButton>
									)}
									{target.kind === "area" && editingArea.current && (
										<SmallButton
											label="Aspect ratio"
											onClick={async (event) => {
												const rect =
													event.currentTarget.getBoundingClientRect();
												const choice = await window.electronAPI.hudShowMenu(
													{
														x: rect.left,
														y: rect.bottom + 4,
														above: rect.top - 4,
														items: AREA_RATIOS.map((entry) => ({
															id: entry.label,
															label: entry.label,
															type: "radio" as const,
															checked: entry.ratio === areaRatio,
														})),
													},
												);
												const picked = AREA_RATIOS.find(
													(entry) => entry.label === choice,
												);
												if (!picked) return;
												setAreaRatio(picked.ratio);
												if (
													picked.ratio &&
													current.current?.kind === "area"
												) {
													const area = current.current.rect;
													setAreaSize(
														area.width,
														area.width / picked.ratio,
														picked.ratio,
													);
												}
											}}
										>
											{AREA_RATIOS.find((entry) => entry.ratio === areaRatio)
												?.label ?? "Free"}
										</SmallButton>
									)}
								</div>
								{message && target.kind === "window" && (
									<div className="text-sm text-red-200">{message}</div>
								)}
								<StartButton onStart={() => finish(current.current, true)} />
							</div>
						</div>
					)}
					{showStartCard && target.kind === "window" && (
						// Sits at the bottom edge of the hovered window, apart from Start recording.
						<div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
							<SmallButton glass={onGlass} onClick={() => editArea(target.rect)}>
								Adjust recording area
							</SmallButton>
						</div>
					)}
				</div>
			)}
			{mode === "window" && !hasWindows && !target && (
				// Screen Studio's look: system font, a medium title and a light, softly rounded button.
				<div
					className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white"
					style={{
						fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
						textShadow: "0 1px 6px rgba(0,0,0,0.45)",
					}}
				>
					<div className="text-4xl font-medium">No windows to select</div>
					<button
						type="button"
						className="rounded-lg bg-white/15 px-5 py-2.5 text-base hover:bg-white/25"
						onPointerDown={(event) => event.stopPropagation()}
						onPointerUp={(event) => event.stopPropagation()}
						onClick={() => finish({ kind: "screen", rect: screenRect() }, true)}
					>
						Record entire display
					</button>
				</div>
			)}
			{target?.kind === "area" && mode !== "area" && (
				<div
					className="absolute bottom-12 left-1/2 -translate-x-1/2"
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") event.stopPropagation();
					}}
				>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							press.current = null;
							editingArea.current = false;
							current.current = null;
							setTarget(null);
						}}
					>
						Choose another source
					</Button>
				</div>
			)}
		</div>
	);
}

/** Exact width and height for an area, as Screen Studio's Area mode offers. */
/**
 * One typed size. Typing edits a draft that applies on Enter or when the field is left,
 * so a number can be typed digit by digit; the arrow keys and steppers apply at once.
 */
function SizeField({
	value,
	label,
	onCommit,
}: {
	value: number;
	label: string;
	onCommit: (next: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = (text: string) => {
		const next = Number(text);
		if (text.trim() !== "" && Number.isFinite(next)) onCommit(Math.max(next, MIN_AREA_SIZE));
	};
	return (
		<input
			aria-label={label}
			type="number"
			min={MIN_AREA_SIZE}
			className="pointer-events-auto w-20 rounded-md bg-white/20 px-2 py-0.5 text-center text-sm text-white tabular-nums outline-none focus:bg-white/30"
			style={{ textShadow: "none" }}
			value={draft ?? String(Math.round(value))}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			onChange={(event) => {
				const text = event.target.value;
				// Steppers and arrow keys send no input type; typing does.
				if (!(event.nativeEvent as InputEvent).inputType) {
					setDraft(null);
					commit(text);
				} else {
					setDraft(text);
				}
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" && draft !== null) {
					commit(draft);
					setDraft(null);
				} else if (event.key === "Escape") {
					// Undo the typing, or leave the field so the next Escape closes the picker.
					if (draft !== null) setDraft(null);
					else event.currentTarget.blur();
				}
			}}
			onBlur={() => {
				if (draft !== null) commit(draft);
				setDraft(null);
			}}
		/>
	);
}

function AreaSizeFields({
	rect,
	ratio,
	onSize,
}: {
	rect: AreaRect;
	ratio: number | null;
	onSize: (width: number, height: number) => void;
}) {
	return (
		<>
			<SizeField
				label="Width"
				value={rect.width}
				onCommit={(width) => onSize(width, ratio ? width / ratio : rect.height)}
			/>
			<span>×</span>
			<SizeField
				label="Height"
				value={rect.height}
				onCommit={(height) => onSize(ratio ? height * ratio : rect.width, height)}
			/>
		</>
	);
}

export default CapturePicker;
