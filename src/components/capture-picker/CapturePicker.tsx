import type {
	MouseEvent as ReactMouseEvent,
	ReactNode,
	PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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

function screenRect() {
	return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

/** A size kept around the rectangle's centre and inside the screen. */
function resizeAroundCentre(rect: AreaRect, width: number, height: number): AreaRect {
	const bounds = screenRect();
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

function StartButton({ onStart }: { onStart: () => void }) {
	return (
		<button
			type="button"
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			className="pointer-events-auto mt-2 flex items-center gap-2 rounded-xl px-6 py-3 text-base font-medium text-white shadow-lg"
			style={{ background: "#5a43f5", textShadow: "none" }}
			onClick={onStart}
		>
			<span className="size-3 rounded-full border-2 border-white" />
			Start recording
		</button>
	);
}

function SmallButton({
	children,
	onClick,
	label,
}: {
	children: ReactNode;
	onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	label?: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			className="pointer-events-auto rounded-md bg-white/20 px-2 py-0.5 text-sm text-white backdrop-blur hover:bg-white/30"
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
	const [display, setDisplay] = useState<{ name?: string; refreshRate?: number }>({});
	const [hasWindows, setHasWindows] = useState(true);
	const [areaRatio, setAreaRatio] = useState<number | null>(null);
	const [message, setMessage] = useState<string | null>(null);
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
				setDisplay({ name: context.displayName, refreshRate: context.refreshRate });
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
				// Only the screen under the pointer shows its target and Start recording.
				const local = context.cursor
					? {
							x: context.cursor.x - origin.current.x,
							y: context.cursor.y - origin.current.y,
						}
					: null;
				const next =
					local && rectContains(screenRect(), local.x, local.y)
						? targetAt(local.x, local.y)
						: null;
				current.current = next;
				editingArea.current = false;
				setTarget(next);
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

	const setAreaSize = (width: number, height: number) => {
		const area = current.current;
		if (area?.kind !== "area") return;
		editArea(resizeAroundCentre(area.rect, width, height));
	};

	const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const start = press.current;
		if (start?.rect) {
			const dx = event.clientX - start.x;
			const dy = event.clientY - start.y;
			update({
				kind: "area",
				rect: start.handle
					? resizeAreaRect(start.rect, start.handle, dx, dy, screenRect())
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
	const sizeText = target
		? `${Math.round(target.rect.width)} × ${Math.round(target.rect.height)}`
		: "";
	const hint =
		target?.kind === "area" && editingArea.current
			? areaTooSmall
				? "Area is too small · Drag to enlarge · Esc to cancel"
				: "Move or resize the area · Enter to record · Esc to cancel"
			: mode === "display"
				? "Choose a screen to record · Esc to cancel"
				: mode === "window"
					? "Choose a window to record · Esc to cancel"
					: mode === "area"
						? "Drag to select an area · Esc to cancel"
						: allowArea
							? "Click a window or the desktop, or drag an area · Esc to cancel"
							: "Click a window or the desktop · Esc to cancel";
	return (
		<div
			className="picker-fade-in fixed inset-0 select-none overflow-hidden"
			style={{ cursor: "crosshair", background: target ? "transparent" : "rgba(0,0,0,0.38)" }}
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
				if (press.current || editingArea.current) return;
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
						boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
						background: target.kind === "screen" ? "rgba(0,0,0,0.3)" : "transparent",
						outline: "1px solid rgba(255,255,255,0.55)",
						outlineOffset: -1,
						borderRadius: target.kind === "window" ? 10 : 0,
						// Glides between hovered windows; an area follows the pointer exactly.
						transition:
							target.kind === "area"
								? undefined
								: "left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease",
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
								// An area's card sits just outside it, so the area itself stays draggable.
								target.kind === "area"
									? target.rect.y + target.rect.height + 240 <= window.innerHeight
										? {
												left: "50%",
												top: "calc(100% + 12px)",
												transform: "translateX(-50%)",
											}
										: {
												left: "50%",
												bottom: "calc(100% + 12px)",
												transform: "translateX(-50%)",
											}
									: { inset: 0 }
							}
						>
							<div
								key={target.kind === "window" ? target.window.id : target.kind}
								className="picker-card-in flex flex-col items-center gap-2 text-white"
								style={{ textShadow: "0 1px 12px rgba(0,0,0,0.55)" }}
							>
								{target.kind === "window" && target.window.appIcon && (
									<img
										src={target.window.appIcon}
										alt=""
										className="size-20 drop-shadow-xl"
										draggable={false}
									/>
								)}
								<div className="text-3xl font-semibold tracking-tight">{label}</div>
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
												? ` · ${display.refreshRate}FPS`
												: ""}
										</span>
									)}
									{target.kind === "window" && target.window.pid && (
										<SmallButton
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
								{target.kind === "window" && (
									<SmallButton onClick={() => editArea(target.rect)}>
										Adjust recording area
									</SmallButton>
								)}
							</div>
						</div>
					)}
				</div>
			)}
			{mode === "window" && !hasWindows && !target && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
					<div
						className="text-3xl font-semibold"
						style={{ textShadow: "0 1px 12px rgba(0,0,0,0.55)" }}
					>
						No windows to select
					</div>
					<button
						type="button"
						className="rounded-xl bg-white/15 px-5 py-2.5 text-base backdrop-blur hover:bg-white/25"
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
			<div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
				<div className="rounded-full bg-black/80 px-4 py-2 text-sm text-white">{hint}</div>
			</div>
		</div>
	);
}

/** Exact width and height for an area, as Screen Studio's Area mode offers. */
function AreaSizeFields({
	rect,
	ratio,
	onSize,
}: {
	rect: AreaRect;
	ratio: number | null;
	onSize: (width: number, height: number) => void;
}) {
	const field = (value: number, onChange: (next: number) => void, label: string) => (
		<input
			aria-label={label}
			type="number"
			min={MIN_AREA_SIZE}
			className="pointer-events-auto w-20 rounded-md bg-white/20 px-2 py-0.5 text-center text-sm text-white tabular-nums outline-none focus:bg-white/30"
			style={{ textShadow: "none" }}
			value={Math.round(value)}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			onChange={(event) => {
				const next = Number(event.target.value);
				if (Number.isFinite(next) && next >= MIN_AREA_SIZE) onChange(next);
			}}
		/>
	);
	return (
		<>
			{field(
				rect.width,
				(width) => onSize(width, ratio ? width / ratio : rect.height),
				"Width",
			)}
			<span>×</span>
			{field(
				rect.height,
				(height) => onSize(ratio ? height * ratio : rect.width, height),
				"Height",
			)}
		</>
	);
}

export default CapturePicker;
