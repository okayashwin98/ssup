import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const accent = (page: import("@playwright/test").Page) =>
	page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
	);

test("the theme colour defaults to SuperShare purple and can be changed in General", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await expect.poll(() => accent(page)).toBe("#9754F4");
	await page.getByRole("button", { name: "Home", exact: true }).click();
	const home = page.getByRole("dialog", { name: "Projects dashboard" });
	await home.getByRole("button", { name: "Settings", exact: true }).click();
	await home.getByRole("row", { name: "General", exact: true }).click();
	const colours = home.getByRole("radiogroup", { name: "Theme colour" });
	await expect(colours.getByRole("radio", { name: "SuperShare purple" })).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await colours.getByRole("radio", { name: "Green" }).click();
	await expect.poll(() => accent(page)).toBe("#17A34A");
	await expect(colours.getByRole("radio", { name: "Green" })).toHaveAttribute(
		"aria-checked",
		"true",
	);
	const capture = home.getByRole("button", { name: "Capture", exact: true });
	await expect(capture).toHaveCSS("background-color", "rgb(23, 163, 74)");
	await colours.getByLabel("Custom theme colour").fill("#123456");
	await expect.poll(() => accent(page)).toBe("#123456");
	await page.screenshot({ path: "test-results/theme-colour.png" });
});
