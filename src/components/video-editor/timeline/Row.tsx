import type { RowDefinition } from "dnd-timeline";
import { useRow } from "dnd-timeline";
import { cn } from "@/lib/utils";
import { type TimelineRowLayer, useTimelineLayers } from "./timelineLayerContext";
import { TIMELINE_CLIP_ROW_HEIGHT_PX, TIMELINE_ROW_MIN_HEIGHT_PX } from "./timelineLayout";

/** Width of the column of row icons at the timeline's left. */
export const TIMELINE_ROW_HEADER_WIDTH_PX = 36;

interface RowProps extends RowDefinition {
	embedded?: boolean;
	caption?: boolean;
	compact?: boolean;
	filmstrip?: boolean;
	children: React.ReactNode;
	label?: string;
	hint?: string;
	isEmpty?: boolean;
	disabled?: boolean;
	/** The row's icon in the left column; clicking it turns the row on or off. */
	layer?: TimelineRowLayer;
	labelColor?: string;
	onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
	onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
	onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
	onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
	onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export default function Row({
	id,
	embedded = false,
	caption = false,
	compact = true,
	filmstrip = false,
	children,
	label,
	hint,
	isEmpty,
	disabled = false,
	layer,
	labelColor = "#666",
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
	onMouseDown,
	onClick,
}: RowProps) {
	const { setNodeRef, setSidebarRef, rowWrapperStyle, rowStyle, rowSidebarStyle } = useRow({
		id,
	});
	const layers = useTimelineLayers();
	const on = !layer || !layers || layers.isOn(layer.id);
	const Icon = layer?.icon;

	return (
		<div
			className="bg-transparent relative"
			style={{
				...rowWrapperStyle,
				...(embedded || caption
					? {
							position: "absolute" as const,
							insetInline: 0,
							...(caption ? { top: 36 } : { bottom: 7 }),
							zIndex: 15,
							pointerEvents: "none" as const,
						}
					: {}),
				marginBottom: 2,
				flexGrow: 0,
				flexShrink: 0,
				height:
					embedded || caption
						? 20
						: filmstrip || !compact
							? TIMELINE_CLIP_ROW_HEIGHT_PX
							: TIMELINE_ROW_MIN_HEIGHT_PX,
				flexBasis: caption
					? 20
					: filmstrip || !compact
						? TIMELINE_CLIP_ROW_HEIGHT_PX
						: TIMELINE_ROW_MIN_HEIGHT_PX,
			}}
		>
			<div
				ref={setSidebarRef}
				className="flex shrink-0 items-center justify-center self-stretch"
				style={{ ...rowSidebarStyle, width: TIMELINE_ROW_HEADER_WIDTH_PX }}
			>
				{layer && Icon && layers && (
					<button
						type="button"
						aria-label={layer.label}
						aria-pressed={on}
						title={`${layer.label}: ${on ? "on" : "off"}`}
						onClick={() => layers.toggle(layer.id)}
						className={cn(
							"pointer-events-auto relative flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-foreground/10",
							on ? "text-foreground/70 hover:text-foreground" : "text-foreground/30",
						)}
					>
						<Icon className="size-4" />
						{/* Off: the icon is struck through. */}
						{!on && (
							<span
								aria-hidden="true"
								className="absolute h-[1.5px] w-5 rotate-45 rounded-full bg-current"
							/>
						)}
					</button>
				)}
			</div>
			<div
				ref={setNodeRef}
				// The row's blocks; the icon column sits before it.
				data-timeline-row={id}
				data-layer-off={on ? undefined : ""}
				// Items set their own pointer-events, so inert is what stops drags and resizes.
				// Only the blocks: the row's icon stays clickable to turn it back on.
				inert={disabled}
				aria-disabled={disabled || undefined}
				className="relative min-w-0 self-stretch"
				style={{ ...rowStyle, ...(disabled || !on ? { opacity: 0.35 } : {}) }}
				onMouseEnter={onMouseEnter}
				onMouseMove={onMouseMove}
				onMouseLeave={onMouseLeave}
				onMouseDown={onMouseDown}
				onClick={onClick}
			>
				{label && (
					<div
						className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-widest z-20 pointer-events-none select-none"
						style={{ color: labelColor, writingMode: "horizontal-tb" }}
					>
						{label}
					</div>
				)}
				{isEmpty && hint && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
						<span className="text-[11px] text-foreground/15 font-medium">{hint}</span>
					</div>
				)}
				{children}
			</div>
		</div>
	);
}
