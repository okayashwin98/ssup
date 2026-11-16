import { app, ipcMain } from "electron";

/**
 * Open at login, read from the system every time so the switch matches System Settings.
 * Only the installed app can turn it on: in development the login item would be Electron.
 */
function openAtLoginState() {
	const supported = process.platform === "darwin" || process.platform === "win32";
	const available = supported && app.isPackaged;
	return {
		success: true,
		supported,
		available,
		openAtLogin: available && app.getLoginItemSettings().openAtLogin,
	};
}

export function registerLoginItemHandlers() {
	ipcMain.handle("get-open-at-login", () => {
		try {
			return openAtLoginState();
		} catch (error) {
			return {
				success: false,
				supported: false,
				available: false,
				openAtLogin: false,
				error: String(error),
			};
		}
	});

	ipcMain.handle("set-open-at-login", (_, enabled: unknown) => {
		if (typeof enabled !== "boolean") {
			return { ...openAtLoginState(), success: false, error: "Invalid value" };
		}
		if (!openAtLoginState().available) {
			return {
				...openAtLoginState(),
				success: false,
				error: "Open at login works only in the installed app.",
			};
		}
		try {
			app.setLoginItemSettings({ openAtLogin: enabled });
			return openAtLoginState();
		} catch (error) {
			return { ...openAtLoginState(), success: false, error: String(error) };
		}
	});
}
