import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("the aspect ratio picker offers ratios, a typed size and social presets", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const trigger = page.getByRole("button", { name: /^Aspect ratio:/ });
	await expect(trigger).toBeVisible({ timeout: 20000 });
	const frame = page.locator(".editor-preview-frame");
	const shape = async () => {
		const box = await frame.boundingBox();
		return box!.width / box!.height;
	};
	await trigger.click();
	const presets = page.getByRole("radiogroup", { name: "Aspect ratio presets" });
	// Every ratio the old dropdown had is still offered.
	for (const ratio of ["Native", "16:9", "9:16", "1:1", "4:3", "4:5", "16:10", "10:16"]) {
		await expect(presets.getByRole("radio", { name: ratio, exact: true })).toBeVisible();
	}
	await presets.getByRole("radio", { name: "10:16", exact: true }).click();
	await expect.poll(shape).toBeCloseTo(10 / 16, 1);
	await expect(trigger).toHaveAccessibleName("Aspect ratio: 10:16");

	// Presets sharing a ratio highlight only the one that was picked.
	await presets.getByRole("radio", { name: "Story 9:16" }).click();
	await expect(presets.getByRole("radio", { name: "Story 9:16" })).toBeChecked();
	await expect(presets.getByRole("radio", { name: "9:16", exact: true })).not.toBeChecked();
	await expect.poll(shape).toBeCloseTo(9 / 16, 1);
	await presets.getByRole("radio", { name: "Cover 3:1" }).click();
	await expect.poll(shape).toBeCloseTo(3, 1);

	// A typed size applies once both sides are valid, and says so when they are not.
	const width = page.getByRole("textbox", { name: "Width" });
	const height = page.getByRole("textbox", { name: "Height" });
	await height.fill("50");
	await width.fill("1000");
	await expect(page.getByRole("alert")).toContainText("128 to 7680");
	await expect(trigger).toHaveAccessibleName("Aspect ratio: 3:1");
	await height.fill("1000");
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect.poll(shape).toBeCloseTo(1, 1);
	await expect(trigger).toHaveAccessibleName("Aspect ratio: 1000 × 1000");

	await page.mouse.move(5, 500);
	for (const dark of [false, true]) {
		await page.evaluate((on) => document.documentElement.classList.toggle("dark", on), dark);
		await page.screenshot({
			path: `test-results/aspect-ratio-picker-${dark ? "dark" : "light"}.png`,
			animations: "disabled",
		});
	}
	await page.keyboard.press("Escape");
	await expect(presets).toHaveCount(0);
	await expect(trigger).toHaveAccessibleName("Aspect ratio: 1000 × 1000");
});
