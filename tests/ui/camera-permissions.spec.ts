import { expect, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

test("the bar never opens the camera; the webcam bubble shows only outside the editor", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		let visible: ((value: boolean) => void) | undefined;
		window.electronAPI.getRecordingPreferences = async () => ({
			success: true,
			webcamEnabled: true,
			microphoneEnabled: false,
			systemAudioEnabled: false,
		});
		window.electronAPI.getEditorMode = async () => true;
		window.electronAPI.onEditorModeChanged = (callback) => {
			visible = callback;
			return () => {
				visible = undefined;
			};
		};
		window.addEventListener("test-leave-editor", () => visible?.(false));
		window.addEventListener("test-enter-editor", () => visible?.(true));
		let requests = 0;
		Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
			value: async () => {
				document.documentElement.dataset.cameraRequests = String(++requests);
				const canvas = document.createElement("canvas");
				const stream = canvas.captureStream();
				for (const track of stream.getTracks()) {
					const stop = track.stop.bind(track);
					track.stop = () => {
						document.documentElement.dataset.cameraStopped = "true";
						stop();
					};
				}
				return stream;
			},
		});
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	await expect(page.getByRole("button", { name: "Webcam" })).toBeVisible();
	await expect(html).toHaveAttribute("data-webcam-bubble", "false");
	await page.evaluate(() => window.dispatchEvent(new Event("test-leave-editor")));
	await expect(html).toHaveAttribute("data-webcam-bubble", "true");
	await page.evaluate(() => window.dispatchEvent(new Event("test-enter-editor")));
	await expect(html).toHaveAttribute("data-webcam-bubble", "false");
	await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event("devicechange")));
	// The camera preview lives in the bubble window; the bar itself never opens the camera.
	expect(await html.getAttribute("data-camera-requests")).toBeNull();
});

type MenuItems = Parameters<typeof window.electronAPI.hudShowMenu>[0]["items"];

test("the camera asks macOS once, when it is turned on, never when the bar opens", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		let camera = "not-determined";
		// Read late: the page replaces the document element after this runs.
		const data = () => document.documentElement.dataset;
		window.electronAPI.getMediaPermissionStatus = async () => ({
			success: true,
			camera,
			microphone: "granted",
		});
		window.electronAPI.requestMediaPermission = async () => {
			data().cameraPrompts = String(Number(data().cameraPrompts ?? 0) + 1);
			camera = "granted";
			return { success: true, granted: true };
		};
		navigator.mediaDevices.enumerateDevices = async () =>
			[
				{
					kind: "videoinput",
					deviceId: "cam-1",
					label: "FaceTime HD Camera",
					groupId: "g",
				},
			] as unknown as MediaDeviceInfo[];
		window.electronAPI.hudShowMenu = async ({ items }) => {
			const device = items.find((item) => item.id?.startsWith("device:"));
			return device?.id ?? null;
		};
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	const camera = page.getByTitle("Webcam", { exact: true });
	await expect(camera).toHaveText("No camera");
	await expect(html).not.toHaveAttribute("data-camera-prompts");
	await camera.click();
	await expect(html).toHaveAttribute("data-camera-prompts", "1");
	await expect(camera).toHaveText("FaceTime HD Camera");
	await expect(html).toHaveAttribute("data-webcam-bubble", "true");
	await camera.click();
	await expect(camera).toHaveText("FaceTime HD Camera");
	await expect(html).toHaveAttribute("data-camera-prompts", "1");
});

for (const blocked of ["denied", "restricted"]) {
	test(`with camera access ${blocked}, the menu offers System Settings and the camera returns once allowed`, async ({
		page,
	}) => {
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(
			page,
			(status) => {
				let camera = status;
				// Read late: the page replaces the document element after this runs.
				const data = () => document.documentElement.dataset;
				window.electronAPI.getRecordingPreferences = async () => ({
					success: true,
					webcamEnabled: true,
					microphoneEnabled: false,
					systemAudioEnabled: false,
				});
				window.electronAPI.getMediaPermissionStatus = async () => ({
					success: true,
					camera,
					microphone: "granted",
				});
				window.electronAPI.requestMediaPermission = async () => {
					data().cameraPrompts = "1";
					return { success: true, granted: false };
				};
				window.electronAPI.openMediaPermissionPreferences = async (device) => {
					data().settingsOpened = device;
					return { success: true };
				};
				window.electronAPI.hudShowMenu = async ({ items }) => {
					(window as unknown as { lastMenu: MenuItems }).lastMenu = items;
					return items.some((item) => item.id === "open-system-settings")
						? "open-system-settings"
						: null;
				};
				window.addEventListener("test-allow-camera", () => {
					camera = "granted";
				});
			},
			blocked,
		);
		await page.goto("/?windowType=hud-overlay");
		const html = page.locator("html");
		const camera = page.getByTitle("Webcam", { exact: true });
		await expect(camera).toHaveText("No camera");
		await expect(html).toHaveAttribute("data-webcam-bubble", "false");
		await camera.click();
		await expect(html).toHaveAttribute("data-settings-opened", "camera");
		const menu = await page.evaluate(
			() => (window as unknown as { lastMenu: MenuItems }).lastMenu,
		);
		expect(menu.map((item) => item.label ?? item.type)).toEqual([
			"Webcam",
			"Camera access is off for SuperShare",
			"Open System Settings…",
			"separator",
			"No camera",
			"separator",
			"Show Floating Preview",
		]);
		expect(menu.find((item) => item.id === "off")?.checked).toBe(true);
		expect(menu.find((item) => item.id === "bubble")?.enabled).toBe(false);
		await expect(html).not.toHaveAttribute("data-camera-prompts");
		// Coming back from System Settings with access turned on brings the camera back.
		await page.evaluate(() => window.dispatchEvent(new Event("test-allow-camera")));
		await page.evaluate(() => window.dispatchEvent(new Event("focus")));
		await expect(html).toHaveAttribute("data-webcam-bubble", "true");
		await expect(camera).not.toHaveText("No camera");
	});
}

test("with microphone access denied, its menu offers System Settings instead of devices", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		// Read late: the page replaces the document element after this runs.
		const data = () => document.documentElement.dataset;
		window.electronAPI.getRecordingPreferences = async () => ({
			success: true,
			webcamEnabled: false,
			microphoneEnabled: true,
			systemAudioEnabled: false,
		});
		window.electronAPI.getMediaPermissionStatus = async () => ({
			success: true,
			camera: "granted",
			microphone: "denied",
		});
		navigator.mediaDevices.getUserMedia = async () => {
			data().microphoneOpened = "true";
			throw new DOMException("Denied", "NotAllowedError");
		};
		window.electronAPI.openMediaPermissionPreferences = async (device) => {
			data().settingsOpened = device;
			return { success: true };
		};
		window.electronAPI.hudShowMenu = async ({ items }) => {
			(window as unknown as { lastMenu: MenuItems }).lastMenu = items;
			return "open-system-settings";
		};
	});
	await page.goto("/?windowType=hud-overlay");
	const html = page.locator("html");
	const microphone = page.getByTitle("Microphone", { exact: true });
	await expect(microphone).toHaveText("No microphone");
	await microphone.click();
	await expect(html).toHaveAttribute("data-settings-opened", "microphone");
	const menu = await page.evaluate(() => (window as unknown as { lastMenu: MenuItems }).lastMenu);
	expect(menu.map((item) => item.label ?? item.type)).toEqual([
		"Microphone",
		"Microphone access is off for SuperShare",
		"Open System Settings…",
		"separator",
		"No microphone",
	]);
	// Neither the level meter nor the device list opened the microphone.
	await expect(html).not.toHaveAttribute("data-microphone-opened");
});
