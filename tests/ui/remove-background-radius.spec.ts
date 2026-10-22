import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("remove background zeroes the radius, and raising the radius turns it off", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const removeBackground = page.getByRole("switch", { name: "Remove background" });
	const radius = page.getByRole("slider", { name: "Radius", exact: true });
	await expect(removeBackground).toBeVisible({ timeout: 20000 });
	await expect(removeBackground).not.toBeChecked();
	const startRadius = await radius.inputValue();
	expect(Number(startRadius)).toBeGreaterThan(0);

	await removeBackground.click({ force: true });
	await expect(removeBackground).toBeChecked();
	await expect(radius).toHaveValue("0");

	await radius.focus();
	await page.keyboard.press("ArrowRight");
	await expect(removeBackground).not.toBeChecked();

	await removeBackground.click({ force: true });
	await expect(radius).toHaveValue("0");
	await removeBackground.click({ force: true });
	await expect(removeBackground).not.toBeChecked();
	await expect(radius).not.toHaveValue("0");
});
