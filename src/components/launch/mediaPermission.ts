/** macOS camera and microphone access as the start bar sees it. */
export type MediaPermissionStatus =
	| "checking"
	| "granted"
	| "not-determined"
	| "denied"
	| "restricted"
	| "unknown";

export type MediaDevice = "camera" | "microphone";

type MediaPermissionApi = Pick<
	Window["electronAPI"],
	"getMediaPermissionStatus" | "requestMediaPermission"
>;

const KNOWN = new Set(["granted", "not-determined", "denied", "restricted"]);

export function isMediaAllowed(status: MediaPermissionStatus) {
	return status === "granted";
}

/** Access was refused (or locked by the Mac's owner): only System Settings can change it. */
export function needsSystemSettings(status: MediaPermissionStatus) {
	return status === "denied" || status === "restricted";
}

/**
 * Reads and asks for one device's access. The macOS prompt is shown at most once at a
 * time, and only while access is still undecided; every other call just reads.
 */
export function createMediaPermissionTracker(
	device: MediaDevice,
	api: MediaPermissionApi,
	onChange: (status: MediaPermissionStatus) => void,
) {
	let status: MediaPermissionStatus = "checking";
	let pending: Promise<MediaPermissionStatus> | null = null;
	let disposed = false;
	const set = (next: MediaPermissionStatus) => {
		status = next;
		if (!disposed) onChange(next);
		return next;
	};

	const read = async (): Promise<MediaPermissionStatus> => {
		try {
			const result = await api.getMediaPermissionStatus();
			if (!result.success) return "unknown";
			const value = result[device];
			return KNOWN.has(value) ? (value as MediaPermissionStatus) : "unknown";
		} catch {
			return "unknown";
		}
	};

	return {
		get status() {
			return status;
		},
		/** Reads the current access without prompting; a prompt in progress wins. */
		async refresh() {
			if (pending) return pending;
			const next = await read();
			return pending ? pending : set(next);
		},
		/** Shows the macOS prompt if access is undecided; otherwise reports the current access. */
		async request() {
			if (pending) return pending;
			pending = (async () => {
				try {
					const current = await read();
					if (current !== "not-determined") return set(current);
					const result = await api.requestMediaPermission(device);
					if (!result.success) return set(await read());
					return set(result.granted ? "granted" : "denied");
				} catch {
					return set(await read());
				} finally {
					pending = null;
				}
			})();
			return pending;
		},
		dispose() {
			disposed = true;
		},
	};
}
