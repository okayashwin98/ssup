import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("the aspect ratio picker offers ratios, 3:1 included, and a typed size", async ({ page }) => {
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

	// The social rows are gone; their one extra shape, 3:1, is in the main list, widest first.
	await expect(presets.getByRole("radio")).toHaveCount(13);
	await expect(presets.getByText(/^(X|YouTube|Instagram)$/)).toHaveCount(0);
	await expect(presets.getByRole("radio").nth(1)).toHaveAccessibleName("3:1");
	await presets.getByRole("radio", { name: "3:1", exact: true }).click();
	await expect(presets.getByRole("radio", { name: "3:1", exact: true })).toBeChecked();
	await expect(presets.getByRole("radio", { name: "16:9", exact: true })).not.toBeChecked();
	await expect.poll(shape).toBeCloseTo(3, 1);
	await expect(trigger).toHaveAccessibleName("Aspect ratio: 3:1");
	await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("640");
	await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("213");

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
