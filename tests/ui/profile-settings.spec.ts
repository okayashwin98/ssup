import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { openDashboardSettings } from "./settings";

async function openProfileSettings(page: Page) {
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Profile", exact: true }).click();
	return page.getByRole("form", { name: "Profile settings", exact: true });
}

test("the Profile tab edits only your name and photo, and keeps them after a reload", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getAppSetting = (key) =>
			key === "recordly.onboarding.v1.seen"
				? true
				: JSON.parse(localStorage.getItem(key) || "null");
		window.electronAPI.setAppSetting = (key, value) => {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		};
		window.electronAPI.cloudShareProfile = async () => ({ success: true });
	});
	await page.goto("/?windowType=editor");
	let profile = await openProfileSettings(page);
	await expect(profile.getByRole("button", { name: "Upload photo" })).toBeVisible();
	const settings = page.getByRole("dialog", { name: "Projects dashboard", exact: true });
	for (const gone of [/sign out/i, /sign in/i, /email/i, /session/i])
		await expect(settings.getByText(gone)).toHaveCount(0);
	await expect(profile.getByRole("button", { name: "Save profile" })).toBeDisabled();
	await profile.getByRole("textbox", { name: "Your name" }).fill("  Jordan Chen  ");
	await profile.getByRole("button", { name: "Save profile" }).click();
	await expect(page.getByText("Profile saved")).toBeVisible();
	await page.reload();
	profile = await openProfileSettings(page);
	await expect(profile.getByRole("textbox", { name: "Your name" })).toHaveValue("Jordan Chen");
	await expect(
		profile.getByRole("img", { name: "Jordan Chen" }).or(profile.getByText("JC")),
	).toBeVisible();
});

test("Settings refreshes macOS permissions and opens the permissions carousel", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getScreenRecordingPermissionStatus = async () => ({
			success: true,
			status: document.documentElement.dataset.allowed === "true" ? "granted" : "denied",
		});
		window.electronAPI.getAccessibilityPermissionStatus = async () => ({
			success: true,
			trusted: document.documentElement.dataset.allowed === "true",
			prompted: false,
		});
	});
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	const permissions = page.getByRole("region", { name: "Permissions settings", exact: true });
	await expect(permissions.getByText("Required", { exact: true })).toHaveCount(2);
	await page.evaluate(() => {
		document.documentElement.dataset.allowed = "true";
	});
	await permissions.getByRole("button", { name: "Check again", exact: true }).click();
	await expect(permissions.getByText("Allowed", { exact: true })).toHaveCount(2);
	await permissions.getByRole("button", { name: "Review permissions", exact: true }).click();
	const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
	await expect(tour).toHaveAttribute("data-onboarding-state", "permissions");
	await expect(tour.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled();
});
