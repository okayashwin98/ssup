import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
	mergeHudInteractiveBounds,
	shouldRestoreHudMousePassthroughAfterDrag,
} from "../hudMousePassthrough";
import { clampHudOffsetToViewport } from "../hudViewportBounds";

const DEFAULT_RECORDING_HUD_OFFSET = { x: 0, y: 0 };

export function useHudBarDrag({
	hudContentRef,
	hudBarRef,
	recordingWebcamPreviewContainerRef,
}: {
	hudContentRef: RefObject<HTMLDivElement | null>;
	hudBarRef: RefObject<HTMLDivElement | null>;
	recordingWebcamPreviewContainerRef: RefObject<HTMLDivElement | null>;
}) {
	const [recordingHudOffset, setRecordingHudOffset] = useState(DEFAULT_RECORDING_HUD_OFFSET);
	const [isHudDragging, setIsHudDragging] = useState(false);
	const hudBarTransformRef = useRef<HTMLDivElement | null>(null);
	const recordingHudOffsetRef = useRef(DEFAULT_RECORDING_HUD_OFFSET);
	const hudDragStartRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
		initialLeft: number;
		initialTop: number;
		hudWidth: number;
		hudHeight: number;
	} | null>(null);
	const isHudDraggingRef = useRef(false);
	const hudDragMoveRafRef = useRef<number | null>(null);
	const hudDragPendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
	const followingPointerRef = useRef(false);
	// Over the menu bar or Dock the pointer leaves the window but not the display.
	const lastFollowMissRef = useRef(0);

	// The HUD window spans one display; when a drag leaves it, the window jumps to
	// the display under the cursor and the drag carries on there.
	const followPointerToDisplay = useCallback(async () => {
		const follow = window.electronAPI?.hudOverlayFollowPointer;
		const dragState = hudDragStartRef.current;
		if (!follow || !dragState || followingPointerRef.current) return;
		if (performance.now() - lastFollowMissRef.current < 250) return;
		followingPointerRef.current = true;
		try {
			const moved = await follow();
			if (!moved) lastFollowMissRef.current = performance.now();
			if (!moved || hudDragStartRef.current !== dragState || !hudBarRef.current) return;
			// Wait for the window's new size before measuring the bar.
			await new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
			// The drag may have ended while the window moved.
			const current = hudDragStartRef.current;
			if (current !== dragState || !hudBarRef.current) return;
			const grabX = current.startX - current.initialLeft;
			const grabY = current.startY - current.initialTop;
			const clientX = moved.cursorX - moved.originX;
			const clientY = moved.cursorY - moved.originY;
			const left = Math.min(
				Math.max(0, clientX - grabX),
				Math.max(0, window.innerWidth - current.hudWidth),
			);
			const top = Math.min(
				Math.max(0, clientY - grabY),
				Math.max(0, window.innerHeight - current.hudHeight),
			);
			const rect = hudBarRef.current.getBoundingClientRect();
			const nextOffset = {
				x: recordingHudOffsetRef.current.x + (left - rect.left),
				y: recordingHudOffsetRef.current.y + (top - rect.top),
			};
			recordingHudOffsetRef.current = nextOffset;
			if (hudBarTransformRef.current) {
				hudBarTransformRef.current.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
			}
			hudDragStartRef.current = {
				...current,
				startX: clientX,
				startY: clientY,
				originX: nextOffset.x,
				originY: nextOffset.y,
				initialLeft: left,
				initialTop: top,
			};
			hudDragPendingPointerRef.current = { clientX, clientY };
		} finally {
			followingPointerRef.current = false;
		}
	}, [hudBarRef]);

	useEffect(() => {
		recordingHudOffsetRef.current = recordingHudOffset;
		if (!isHudDraggingRef.current && hudBarTransformRef.current) {
			hudBarTransformRef.current.style.transform = `translate3d(${recordingHudOffset.x}px, ${recordingHudOffset.y}px, 0)`;
		}
	}, [recordingHudOffset]);

	const keepHudBarInsideViewport = useCallback(() => {
		if (isHudDraggingRef.current || !hudBarRef.current) {
			return;
		}

		const bounds = hudBarRef.current.getBoundingClientRect();
		const nextOffset = clampHudOffsetToViewport(recordingHudOffsetRef.current, bounds, {
			width: window.innerWidth,
			height: window.innerHeight,
		});
		if (
			nextOffset.x === recordingHudOffsetRef.current.x &&
			nextOffset.y === recordingHudOffsetRef.current.y
		) {
			return;
		}

		recordingHudOffsetRef.current = nextOffset;
		if (hudBarTransformRef.current) {
			hudBarTransformRef.current.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
		}
		setRecordingHudOffset(nextOffset);
	}, [hudBarRef]);

	useEffect(() => {
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(keepHudBarInsideViewport);
		if (hudBarRef.current) {
			resizeObserver?.observe(hudBarRef.current);
		}
		window.addEventListener("resize", keepHudBarInsideViewport);

		return () => {
			window.removeEventListener("resize", keepHudBarInsideViewport);
			resizeObserver?.disconnect();
		};
	}, [hudBarRef, keepHudBarInsideViewport]);

	const handleHudBarPointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			isHudDraggingRef.current = true;
			setIsHudDragging(true);
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
			if (!hudBarRef.current) {
				return;
			}
			const hudRect = hudBarRef.current.getBoundingClientRect();
			hudDragStartRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				originX: recordingHudOffsetRef.current.x,
				originY: recordingHudOffsetRef.current.y,
				initialLeft: hudRect.left,
				initialTop: hudRect.top,
				hudWidth: hudRect.width,
				hudHeight: hudRect.height,
			};
		},
		[hudBarRef],
	);

	const handleHudBarPointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			const dragState = hudDragStartRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			hudDragPendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
			if (hudDragMoveRafRef.current !== null) {
				return;
			}

			hudDragMoveRafRef.current = requestAnimationFrame(() => {
				hudDragMoveRafRef.current = null;
				const latestDragState = hudDragStartRef.current;
				const pointer = hudDragPendingPointerRef.current;
				if (!latestDragState || !pointer) {
					return;
				}

				if (
					pointer.clientX < 0 ||
					pointer.clientY < 0 ||
					pointer.clientX > window.innerWidth ||
					pointer.clientY > window.innerHeight
				) {
					void followPointerToDisplay();
				}
				if (followingPointerRef.current) return;

				const deltaX = pointer.clientX - latestDragState.startX;
				const deltaY = pointer.clientY - latestDragState.startY;
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;
				const unclampedLeft = latestDragState.initialLeft + deltaX;
				const unclampedTop = latestDragState.initialTop + deltaY;
				const clampedLeft = Math.min(
					Math.max(0, unclampedLeft),
					Math.max(0, viewportWidth - latestDragState.hudWidth),
				);
				const clampedTop = Math.min(
					Math.max(0, unclampedTop),
					Math.max(0, viewportHeight - latestDragState.hudHeight),
				);

				const nextOffset = {
					x: latestDragState.originX + (clampedLeft - latestDragState.initialLeft),
					y: latestDragState.originY + (clampedTop - latestDragState.initialTop),
				};
				recordingHudOffsetRef.current = nextOffset;
				if (hudBarTransformRef.current) {
					hudBarTransformRef.current.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
				}
			});
		},
		[followPointerToDisplay],
	);

	const handleHudBarPointerUp = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			const dragState = hudDragStartRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			// Mid display switch the pointer is in the new window's coordinates while the
			// drag state is not, so keep the bar where it is.
			if (!followingPointerRef.current) {
				const pointer = hudDragPendingPointerRef.current || {
					clientX: event.clientX,
					clientY: event.clientY,
				};
				const deltaX = pointer.clientX - dragState.startX;
				const deltaY = pointer.clientY - dragState.startY;
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;

				const clampedLeft = Math.min(
					Math.max(0, dragState.initialLeft + deltaX),
					Math.max(0, viewportWidth - dragState.hudWidth),
				);
				const clampedTop = Math.min(
					Math.max(0, dragState.initialTop + deltaY),
					Math.max(0, viewportHeight - dragState.hudHeight),
				);

				recordingHudOffsetRef.current = {
					x: dragState.originX + (clampedLeft - dragState.initialLeft),
					y: dragState.originY + (clampedTop - dragState.initialTop),
				};
			}

			if (hudDragMoveRafRef.current !== null) {
				cancelAnimationFrame(hudDragMoveRafRef.current);
				hudDragMoveRafRef.current = null;
			}
			hudDragPendingPointerRef.current = null;

			hudDragStartRef.current = null;
			const wasDragging = isHudDraggingRef.current;
			isHudDraggingRef.current = false;
			setRecordingHudOffset({ ...recordingHudOffsetRef.current });
			setIsHudDragging(false);
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			const hudBounds = mergeHudInteractiveBounds(
				[
					hudContentRef.current?.getBoundingClientRect(),
					hudBarRef.current?.getBoundingClientRect(),
					recordingWebcamPreviewContainerRef.current?.getBoundingClientRect(),
				].map((bounds) =>
					bounds
						? {
								left: bounds.left,
								top: bounds.top,
								right: bounds.right,
								bottom: bounds.bottom,
							}
						: null,
				),
			);
			if (
				wasDragging &&
				shouldRestoreHudMousePassthroughAfterDrag(hudBounds, event.clientX, event.clientY)
			) {
				window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
			}
		},
		[hudBarRef, hudContentRef, recordingWebcamPreviewContainerRef],
	);

	useEffect(() => {
		return () => {
			if (hudDragMoveRafRef.current !== null) {
				cancelAnimationFrame(hudDragMoveRafRef.current);
			}
			hudDragMoveRafRef.current = null;
			hudDragPendingPointerRef.current = null;
			hudDragStartRef.current = null;
		};
	}, []);

	return {
		recordingHudOffset,
		isHudDragging,
		hudBarTransformRef,
		isHudDraggingRef,
		handleHudBarPointerDown,
		handleHudBarPointerMove,
		handleHudBarPointerUp,
	};
}
