type ElectronSettingsApi = Pick<Window["electronAPI"], "getAppSetting" | "setAppSetting">;

function getElectronSettingsApi(): ElectronSettingsApi | null {
	const api = (globalThis as typeof globalThis & { electronAPI?: ElectronSettingsApi })
		.electronAPI;
	if (
		!api ||
		typeof api.getAppSetting !== "function" ||
		typeof api.setAppSetting !== "function"
	) {
		return null;
	}

	return api;
}

export function loadAppSetting<T>(key: string): T | null {
	const api = getElectronSettingsApi();
	if (!api) {
		return null;
	}

	try {
		const value = api.getAppSetting(key);
		return value === undefined ? null : (value as T | null);
	} catch {
		return null;
	}
}

export function saveAppSetting(key: string, value: unknown): boolean {
	const api = getElectronSettingsApi();
	if (!api) {
		return false;
	}

	try {
		return api.setAppSetting(key, value);
	} catch {
		return false;
	}
}

/** Runs when another app window saves this setting. Returns an unsubscribe function. */
export function onAppSettingChanged(key: string, listener: (value: unknown) => void): () => void {
	const api = (globalThis as typeof globalThis & { electronAPI?: Partial<Window["electronAPI"]> })
		.electronAPI;
	if (typeof api?.onAppSettingChanged !== "function") return () => undefined;
	return api.onAppSettingChanged((changedKey, value) => {
		if (changedKey === key) listener(value);
	});
}

/**
 * For data that must survive a restart. The packaged screens are served from a new local
 * address each launch, and browser storage belongs to that address, so it starts empty
 * every time. App settings live in the main process. Browser storage is read only when no
 * app setting exists yet (tests, or data written by an older build this launch).
 */
export function loadLastingValue(key: string): unknown {
	const persisted = loadAppSetting<unknown>(key);
	if (persisted !== null) return persisted;
	try {
		const stored = globalThis.localStorage?.getItem(key);
		return stored ? JSON.parse(stored) : null;
	} catch {
		return null;
	}
}

/** True when the value was kept: in app settings in the app, in browser storage elsewhere. */
export function saveLastingValue(key: string, value: unknown): boolean {
	const inApp = getElectronSettingsApi() !== null;
	const saved = saveAppSetting(key, value);
	let mirrored = false;
	try {
		globalThis.localStorage?.setItem(key, JSON.stringify(value));
		mirrored = true;
	} catch {
		// App settings are the store that matters in the app.
	}
	return inApp ? saved : mirrored;
}
