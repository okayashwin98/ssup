import { expect, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { openDashboardSettings } from "./settings";

for (const colorScheme of ["light", "dark"] as const) {
	test(`General shows Open at login as the system reports it, and changes it (${colorScheme})`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(page, () => {
			let on = true;
			const state = () => ({
				success: true,
				supported: true,
				available: true,
				openAtLogin: on,
			});
			window.electronAPI.getOpenAtLogin = async () => state();
			window.electronAPI.setOpenAtLogin = async (enabled) => {
				on = enabled;
				document.documentElement.dataset.openAtLogin = String(enabled);
				return state();
			};
			window.addEventListener("test-login-item-off", () => {
				on = false;
			});
		});
		await page.goto("/?windowType=editor");
		await openDashboardSettings(page);
		const toggle = page.getByRole("switch", { name: "Open at login" });
		await expect(toggle).toBeChecked();
		await expect(page.getByText("Start SuperShare when you sign in.")).toBeVisible();
		await page.screenshot({ path: `test-results/port-open-at-login-${colorScheme}.png` });
		await toggle.click({ force: true });
		await expect(page.locator("html")).toHaveAttribute("data-open-at-login", "false");
		await expect(toggle).not.toBeChecked();
		await toggle.click({ force: true });
		await expect(toggle).toBeChecked();
		// Turned off in System Settings: coming back shows it off.
		await page.evaluate(() => window.dispatchEvent(new Event("test-login-item-off")));
		await page.evaluate(() => window.dispatchEvent(new Event("focus")));
		await expect(toggle).not.toBeChecked();
	});
}

test("in development Open at login is off and can't be switched, with a note", async ({ page }) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.getOpenAtLogin = async () => ({
			success: true,
			supported: true,
			available: false,
			openAtLogin: false,
		});
	});
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	const toggle = page.getByRole("switch", { name: "Open at login" });
	await expect(toggle).toBeDisabled();
	await expect(toggle).not.toBeChecked();
	await expect(
		page.getByText("Works in the installed app, not in development mode."),
	).toBeVisible();
	await page.screenshot({ path: "test-results/port-open-at-login-dev.png" });
});

test("Open at login is hidden where the system has no login items", async ({ page }) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.getOpenAtLogin = async () => ({
			success: true,
			supported: false,
			available: false,
			openAtLogin: false,
		});
	});
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
	await expect(page.getByRole("switch", { name: "Open at login" })).toHaveCount(0);
});
