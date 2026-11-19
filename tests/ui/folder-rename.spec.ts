import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("renaming a folder keeps the field to its sidebar row", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Home", exact: true }).click();
	const dash = page.getByRole("dialog", { name: "Projects dashboard" });
	await dash.getByRole("button", { name: "New folder" }).click();
	await dash.getByRole("button", { name: "Options for Untitled folder" }).click();
	await page.getByRole("menuitem", { name: "Rename" }).click();
	const field = dash.getByRole("textbox", { name: "Folder name" });
	await expect(field).toBeFocused();
	const row = (await field
		.locator("xpath=ancestor::div[contains(@class,'folder-row')]")
		.boundingBox())!;
	const box = (await field.boundingBox())!;
	// The field is exactly the row's 32px; its ring sits in the 4px gap between rows.
	expect(Math.abs(box.y + 1 - row.y)).toBeLessThanOrEqual(1);
	expect(Math.abs(box.height - row.height)).toBeLessThanOrEqual(0.5);
	await field.fill("Loom");
	await field.press("Enter");
	await expect(dash.getByRole("button", { name: "Options for Loom" })).toBeAttached();
});
