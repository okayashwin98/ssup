import { useCallback, useEffect, useRef, useState } from "react";
import {
	createMediaPermissionTracker,
	type MediaDevice,
	type MediaPermissionStatus,
} from "../mediaPermission";

/**
 * One device's macOS access for the start bar. Reading never prompts; `request` shows the
 * one macOS prompt while access is undecided. Elsewhere access is always "granted".
 * `recheckKey` re-reads access whenever it changes (the bar coming back on screen).
 */
export function useMediaPermission(
	device: MediaDevice,
	platform: string | null,
	recheckKey?: unknown,
) {
	const [status, setStatus] = useState<MediaPermissionStatus>("checking");
	const trackerRef = useRef<ReturnType<typeof createMediaPermissionTracker> | null>(null);
	const isMac = platform === "darwin";

	useEffect(() => {
		if (!isMac) return;
		const tracker = createMediaPermissionTracker(device, window.electronAPI, setStatus);
		trackerRef.current = tracker;
		void tracker.refresh();
		// Access changed in System Settings shows up when the user comes back.
		const onFocus = () => void tracker.refresh();
		window.addEventListener("focus", onFocus);
		return () => {
			tracker.dispose();
			if (trackerRef.current === tracker) trackerRef.current = null;
			window.removeEventListener("focus", onFocus);
		};
	}, [device, isMac]);

	useEffect(() => {
		if (recheckKey !== undefined) void trackerRef.current?.refresh();
	}, [recheckKey]);

	const refresh = useCallback(async (): Promise<MediaPermissionStatus> => {
		if (platform === null) return "checking";
		return trackerRef.current ? trackerRef.current.refresh() : "granted";
	}, [platform]);

	const request = useCallback(async (): Promise<MediaPermissionStatus> => {
		if (platform === null) return "checking";
		return trackerRef.current ? trackerRef.current.request() : "granted";
	}, [platform]);

	const current: MediaPermissionStatus =
		platform === null ? "checking" : isMac ? status : "granted";
	return { status: current, refresh, request };
}
