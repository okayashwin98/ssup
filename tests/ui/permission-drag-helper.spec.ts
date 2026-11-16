import { expect, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";
import { openDashboardSettings } from "./settings";

// Matches ACCESSORY_SIZE in electron/ipc/register/permissionAccessory.ts.
const WINDOW = { width: 320, height: 196 };

for (const colorScheme of ["light", "dark"] as const) {
	test(`the drag helper window shows SuperShare's icon, fits its window and drags (${colorScheme})`, async ({
		page,
	}) => {
		await page.setViewportSize(WINDOW);
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await page.goto("/?windowType=permission-accessory&permission=screen");
		const card = page.getByLabel("Add SuperShare to Screen Recording", { exact: true });
		await expect(card).toBeVisible();
		await expect(
			card.getByRole("heading", { name: "Add SuperShare to Screen Recording" }),
		).toBeVisible();
		const icon = card.locator("img");
		await expect
			.poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth))
			.toBe(128);
		expect(await icon.getAttribute("src")).toBe("app-icons/recordlymac-128.png");
		const box = await card.boundingBox();
		expect(box!.y + box!.height).toBeLessThanOrEqual(WINDOW.height);
		expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/recordly/i);
		await page.screenshot({ path: `test-results/port-drag-helper-${colorScheme}.png` });
		const tile = page.getByRole("img", { name: "Drag SuperShare to Screen Recording" });
		await tile.dispatchEvent("dragstart");
		await expect(page.locator("html")).toHaveAttribute("data-permission-drag-started", "true");
		await card.getByRole("button", { name: "Back", exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute(
			"data-permission-accessory-closed",
			"true",
		);
	});
}

test("the drag helper names Accessibility and reports a drag that could not start", async ({
	page,
}) => {
	await page.setViewportSize(WINDOW);
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.startPermissionAccessoryDrag = async () => ({ success: false });
	});
	await page.goto("/?windowType=permission-accessory&permission=accessibility");
	const tile = page.getByRole("img", { name: "Drag SuperShare to Accessibility" });
	await tile.dispatchEvent("dragstart");
	await expect(page.getByRole("alert")).toHaveText("Couldn’t start the drag. Try again.");
});

/** Accessibility is missing; Screen Recording is allowed when `allowScreen` is. */
const missingPermissions = (allowScreen: boolean) => {
	window.electronAPI.getScreenRecordingPermissionStatus = async () => ({
		success: true,
		status: allowScreen ? "granted" : "denied",
	});
	window.electronAPI.getAccessibilityPermissionStatus = async () => ({
		success: true,
		trusted: false,
		prompted: false,
	});
};

for (const colorScheme of ["light", "dark"] as const) {
	test(`Settings offers the drag helper for the first permission still missing (${colorScheme})`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(page, missingPermissions, false);
		await page.goto("/?windowType=editor");
		await openDashboardSettings(page);
		await page.getByRole("row", { name: "Permissions", exact: true }).click();
		const permissions = page.getByRole("region", { name: "Permissions settings", exact: true });
		await expect(permissions.getByText("Required", { exact: true })).toHaveCount(2);
		await expect(permissions.getByText("SuperShare missing from the list?")).toBeVisible();
		await page.screenshot({
			path: `test-results/port-settings-drag-helper-${colorScheme}.png`,
		});
		await permissions.getByRole("button", { name: "Drag SuperShare in", exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute("data-permission-drag-helper", "screen");
	});
}

test("Settings hides the drag helper once both permissions are allowed", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "Permissions", exact: true }).click();
	const permissions = page.getByRole("region", { name: "Permissions settings", exact: true });
	await expect(permissions.getByText("Allowed", { exact: true })).toHaveCount(2);
	await expect(permissions.getByText("SuperShare missing from the list?")).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
	test(`the permissions welcome offers the drag helper as a quiet link (${colorScheme})`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await installDesktopBridge(page);
		await installDesktopBridgeOverrides(page, missingPermissions, true);
		await page.goto("/?windowType=editor");
		await openDashboardSettings(page);
		await page.getByRole("row", { name: "Permissions", exact: true }).click();
		await page.getByRole("button", { name: "Review permissions" }).click();
		const tour = page.getByRole("dialog", { name: "Welcome to SuperShare" });
		const link = tour.getByRole("button", { name: "Not in the list?", exact: true });
		await expect(link).toBeVisible();
		// The same quiet link look as Check again beside it.
		const check = tour.getByRole("button", { name: "Check again", exact: true });
		const [linkStyle, checkStyle] = await Promise.all(
			[link, check].map((button) =>
				button.evaluate((element) => {
					const style = getComputedStyle(element);
					return [style.fontSize, style.fontWeight, style.color].join(" ");
				}),
			),
		);
		expect(linkStyle).toBe(checkStyle);
		// After the dialog's opening animation.
		await page.waitForTimeout(800);
		await page.screenshot({
			path: `test-results/port-welcome-drag-helper-${colorScheme}.png`,
			animations: "disabled",
		});
		await link.click();
		// Screen Recording is allowed here, so the helper is for Accessibility.
		await expect(page.locator("html")).toHaveAttribute(
			"data-permission-drag-helper",
			"accessibility",
		);
	});
}
