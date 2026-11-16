import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { openDashboardSettings } from "./settings";

test("settings opens the permissions welcome and Start recording opens the recorder", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible({
		timeout: 15000,
	});
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	await page.getByRole("button", { name: "Review permissions" }).click();
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
	await expect(tour.getByText("Allowed", { exact: true })).toHaveCount(2);
	await expect
		.poll(() =>
			tour
				.locator(".onboarding-permissions")
				.evaluate((element) => element.scrollHeight - element.clientHeight),
		)
		.toBeLessThanOrEqual(1);
	await tour.getByRole("button", { name: "Start recording", exact: true }).click();
	await expect(tour).not.toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	await page.getByRole("button", { name: "Review permissions" }).click();
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
});

test("first launch opens the permissions welcome, never sign-in, and persists completion", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getAppSetting = (key) => JSON.parse(localStorage.getItem(key) || "null");
		window.electronAPI.setAppSetting = (key, value) => {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		};
	});
	await page.goto("/?windowType=editor");
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
	await expect(tour).toHaveAttribute("data-onboarding-state", "permissions");
	await expect(tour.getByPlaceholder("you@example.com")).toHaveCount(0);
	await expect(page.getByText(/sign in/i)).toHaveCount(0);
	await expect(tour.locator("[data-permissions-confetti]")).toBeVisible();
	await tour.getByRole("button", { name: "Start recording", exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("recordly.onboarding.v1.seen")))
		.toBe("true");
	await page.reload();
	await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible({
		timeout: 15000,
	});
	await expect(tour).not.toBeVisible();
});

test("onboarding fits a compact window with reduced motion", async ({ page }) => {
	await installDesktopBridge(page);
	await page.setViewportSize({ width: 620, height: 740 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible({
		timeout: 15000,
	});
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	await page.getByRole("button", { name: "Review permissions" }).click();
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(
		tour.getByRole("button", { name: "Start recording", exact: true }),
	).toBeInViewport();
	for (const size of [
		{ width: 720, height: 780 },
		{ width: 640, height: 650 },
		{ width: 390, height: 600 },
		{ width: 620, height: 740 },
	]) {
		await page.setViewportSize(size);
		await expect
			.poll(() =>
				tour
					.locator(".onboarding-permissions")
					.evaluate((element) => element.scrollHeight - element.clientHeight),
			)
			.toBeLessThanOrEqual(1);
	}
	await page.screenshot({ path: "test-results/onboarding-compact.png" });
});

test("short dark windows fit the permissions page without scrolling", async ({ page }) => {
	await installDesktopBridge(page);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	await page.getByRole("button", { name: "Review permissions" }).click();
	await page.setViewportSize({ width: 390, height: 600 });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
	await expect(
		tour.getByRole("button", { name: "Start recording", exact: true }),
	).toBeInViewport();
	const body = tour.locator("[data-onboarding-body]");
	await expect
		.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight))
		.toBeLessThanOrEqual(1);
	await expect
		.poll(() =>
			body.evaluate(
				(element) =>
					element.parentElement!.scrollHeight - element.parentElement!.clientHeight,
			),
		)
		.toBeLessThanOrEqual(1);
	await expect(tour.locator("[data-permissions-confetti]")).toHaveCount(0);
	await page.screenshot({ path: "test-results/onboarding-narrow-permissions.png" });
});

test("missing macOS permissions gate Start recording until access is allowed", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		let screen = false;
		let accessibility = false;
		Object.assign(window.electronAPI, {
			getScreenRecordingPermissionStatus: async () => ({
				success: true,
				status: screen ? "granted" : "denied",
			}),
			getAccessibilityPermissionStatus: async () => ({
				success: true,
				trusted: accessibility,
				prompted: false,
			}),
			openScreenRecordingPreferences: async () => {
				screen = true;
				document.documentElement.dataset.screenSettings = "true";
				return { success: true };
			},
			openAccessibilityPreferences: async () => {
				accessibility = true;
				document.documentElement.dataset.accessibilitySettings = "true";
				return { success: true };
			},
		});
	});
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	await page.getByRole("button", { name: "Review permissions" }).click();
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	const start = tour.getByRole("button", { name: "Start recording", exact: true });
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
	await expect(start).toBeDisabled();
	await expect(tour.locator("[data-onboarding-brand]")).toHaveCount(0);
	await expect(tour.getByText(/Allow both, then come back here/)).toBeVisible();
	await expect(tour.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 600 });
	await expect
		.poll(() =>
			tour
				.locator(".onboarding-permissions")
				.evaluate((element) => element.scrollHeight - element.clientHeight),
		)
		.toBeLessThanOrEqual(1);
	await expect(tour.locator("[data-permissions-confetti]")).toHaveCount(0);
	await expect(page.locator("html")).not.toHaveAttribute("data-screen-settings");
	await tour.getByRole("button", { name: "Allow Screen Recording", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("data-screen-settings", "true");
	await expect(start).toBeDisabled();
	await tour.getByRole("button", { name: "Allow Accessibility", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("data-accessibility-settings", "true");
	await expect(tour.getByText("Allowed", { exact: true })).toHaveCount(2);
	await expect(start).toBeEnabled();
	await expect(tour.getByRole("button", { name: "Check again", exact: true })).toHaveCount(0);
	await expect(tour.locator("[data-permissions-confetti]")).toBeVisible();
	await expect(tour.locator("[data-permissions-confetti]")).toHaveCount(0, { timeout: 5000 });
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(tour.locator("[data-permissions-confetti]")).toHaveCount(0);
	await page.screenshot({
		path: "test-results/onboarding-permissions.png",
		animations: "disabled",
	});
	await start.click();
	await expect(tour).not.toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
});

for (const platform of ["win32", "linux"]) {
	test(`${platform} onboarding skips macOS permission APIs`, async ({ page }) => {
		await installDesktopBridge(page);
		await page.addInitScript((platform) => {
			window.electronAPI.getPlatform = async () => platform;
			window.electronAPI.getScreenRecordingPermissionStatus = async () => {
				throw new Error("macOS-only check");
			};
			window.electronAPI.getAccessibilityPermissionStatus = async () => {
				throw new Error("macOS-only check");
			};
		}, platform);
		await page.goto("/?windowType=editor");
		await openDashboardSettings(page);
		await page.getByRole("row", { name: "Permissions", exact: true }).click();
		await page.getByRole("button", { name: "Review permissions" }).click();
		const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
		await expect(
			tour.getByRole("heading", { name: "Allow SuperShare to record" }),
		).toBeVisible();
		await expect(
			tour.getByRole("button", { name: "Start recording", exact: true }),
		).toBeEnabled();
		await expect(tour.getByText("Screen Recording", { exact: true })).toHaveCount(0);
		await expect(tour.getByText("macOS System Settings", { exact: false })).toHaveCount(0);
		await tour.getByRole("button", { name: "Start recording", exact: true }).click();
		await expect(tour).not.toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
	});
}

test("HUD routes missing permissions to onboarding without opening System Settings on launch", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getScreenRecordingPermissionStatus = async () => ({
			success: true,
			status: "denied",
		});
		window.electronAPI.openScreenRecordingPreferences = async () => {
			document.documentElement.dataset.settingsOpened = "true";
			return { success: true };
		};
	});
	await page.goto("/?windowType=hud-overlay");
	await expect(page.locator("html")).toHaveAttribute("data-permissions-opened", "true");
	await expect(page.locator("html")).not.toHaveAttribute("data-settings-opened");
});

test("a permission request opens its page even after onboarding was already completed", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getAppSetting = (key) =>
			key === "recordly.onboarding.v1.seen" ||
			key === "recordly.onboarding.permissionsRequested"
				? true
				: null;
		window.electronAPI.getScreenRecordingPermissionStatus = async () => ({
			success: true,
			status: "denied",
		});
	});
	await page.goto("/?windowType=editor");
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(tour.getByRole("heading", { name: "Allow SuperShare to record" })).toBeVisible();
});
