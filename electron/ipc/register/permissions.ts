import { clipboard, desktopCapturer, ipcMain, shell, systemPreferences } from "electron";
import { getMacPrivacySettingsUrl } from "../utils";
import {
	dismissPermissionAccessory,
	showPermissionAccessory,
	startPermissionAccessoryDrag,
} from "./permissionAccessory";

export function registerPermissionHandlers() {
	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			// Security: only allow http/https URLs to prevent file:// or custom protocol abuse
			const parsed = new URL(url);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
				return { success: false, error: `Blocked non-HTTP URL: ${parsed.protocol}` };
			}
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			console.error("Failed to open URL:", error);
			return { success: false, error: String(error) };
		}
	});

	// The renderer's clipboard permission is refused by the session policy, so copy here.
	ipcMain.handle("copy-text-to-clipboard", (_, text: unknown) => {
		if (typeof text !== "string" || text.length > 100_000) {
			return { success: false, error: "Nothing valid to copy" };
		}
		clipboard.writeText(text);
		return { success: true };
	});

	ipcMain.handle("get-accessibility-permission-status", () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		return {
			success: true,
			trusted: systemPreferences.isTrustedAccessibilityClient(false),
			prompted: false,
		};
	});

	ipcMain.handle("request-accessibility-permission", () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		return {
			success: true,
			trusted: systemPreferences.isTrustedAccessibilityClient(true),
			prompted: true,
		};
	});

	ipcMain.handle("get-screen-recording-permission-status", () => {
		if (process.platform !== "darwin") {
			return { success: true, status: "granted" };
		}

		try {
			return {
				success: true,
				status: systemPreferences.getMediaAccessStatus("screen"),
			};
		} catch (error) {
			console.error("Failed to get screen recording permission status:", error);
			return { success: false, status: "unknown", error: String(error) };
		}
	});

	// Camera and microphone: read without prompting; the one macOS prompt comes from
	// request-media-permission, which the start bar calls when the device is turned on.
	ipcMain.handle("get-media-permission-status", () => {
		if (process.platform !== "darwin") {
			return { success: true, microphone: "granted", camera: "granted" };
		}
		try {
			return {
				success: true,
				microphone: systemPreferences.getMediaAccessStatus("microphone"),
				camera: systemPreferences.getMediaAccessStatus("camera"),
			};
		} catch (error) {
			console.error("Failed to get media permission status:", error);
			return {
				success: false,
				microphone: "unknown",
				camera: "unknown",
				error: String(error),
			};
		}
	});

	ipcMain.handle("request-media-permission", async (_, device: unknown) => {
		if (device !== "microphone" && device !== "camera") {
			return { success: false, granted: false, error: "Invalid media permission device" };
		}
		if (process.platform !== "darwin") return { success: true, granted: true };
		try {
			const status = systemPreferences.getMediaAccessStatus(device);
			// Only a first-time choice shows the macOS prompt; afterwards it is System Settings' call.
			const granted =
				status === "not-determined"
					? await systemPreferences.askForMediaAccess(device)
					: status === "granted";
			return { success: true, granted };
		} catch (error) {
			return { success: false, granted: false, error: String(error) };
		}
	});

	ipcMain.handle("open-media-permission-preferences", async (_, device: unknown) => {
		if (device !== "microphone" && device !== "camera") {
			return { success: false, error: "Invalid media permission device" };
		}
		if (process.platform !== "darwin") return { success: true };
		try {
			await shell.openExternal(getMacPrivacySettingsUrl(device));
			return { success: true };
		} catch (error) {
			console.error(`Failed to open ${device} preferences:`, error);
			return { success: false, error: String(error) };
		}
	});

	// Opens the permission's page of System Settings with SuperShare's icon below it,
	// ready to drag into the list when SuperShare is missing from it.
	ipcMain.handle("show-permission-drag-helper", async (event, permission: unknown) => {
		if (permission !== "screen" && permission !== "accessibility") {
			return { success: false, error: "Invalid permission" };
		}
		if (process.platform !== "darwin") return { success: true };
		try {
			await shell.openExternal(getMacPrivacySettingsUrl(permission));
		} catch (error) {
			console.error("Failed to open System Settings:", error);
			return { success: false, error: String(error) };
		}
		try {
			await showPermissionAccessory(permission, event?.sender);
		} catch (error) {
			// System Settings is open; its own controls still work without the helper.
			console.warn("Could not show the permission drag helper:", error);
		}
		return { success: true };
	});
	ipcMain.handle("start-permission-accessory-drag", (event) =>
		startPermissionAccessoryDrag(event.sender),
	);
	ipcMain.handle("close-permission-accessory", (event) =>
		dismissPermissionAccessory(event.sender),
	);

	ipcMain.handle("open-screen-recording-preferences", async () => {
		if (process.platform !== "darwin") {
			return { success: true };
		}

		try {
			// First-time access must register Recordly in macOS before its settings row can be enabled.
			if (systemPreferences.getMediaAccessStatus("screen") === "not-determined") {
				try {
					await desktopCapturer.getSources({
						types: ["screen"],
						thumbnailSize: { width: 0, height: 0 },
					});
				} catch {
					// A denied prompt still needs the settings page so access can be enabled later.
				}
			}
			await shell.openExternal(getMacPrivacySettingsUrl("screen"));
			return { success: true };
		} catch (error) {
			console.error("Failed to open Screen Recording preferences:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("open-accessibility-preferences", async () => {
		if (process.platform !== "darwin") {
			return { success: true };
		}

		try {
			await shell.openExternal(getMacPrivacySettingsUrl("accessibility"));
			return { success: true };
		} catch (error) {
			console.error("Failed to open Accessibility preferences:", error);
			return { success: false, error: String(error) };
		}
	});
}
