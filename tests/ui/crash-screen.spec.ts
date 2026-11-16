import { expect, test } from "@playwright/test";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

const shots = process.env.SUPERSHARE_SCREENSHOT_DIR;

test("a failed editor shows a calm crash screen that saves, copies and recovers", async ({
	page,
}) => {
	await page.goto("/tests/ui/crash-screen.html?window=editor");
	const screen = page.getByRole("alertdialog", { name: "Something went wrong" });
	await expect(screen).toBeVisible();
	await expect(screen.getByText("Technical details")).toBeVisible();

	await screen.getByRole("button", { name: "Copy details" }).click();
	await expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
	const copied = await page.locator("html").getAttribute("data-copied");
	expect(copied).toContain("Cannot read properties of undefined (reading 'clips')");
	expect(copied).toContain("editor window");

	await screen.getByRole("button", { name: "Save report" }).click();
	await expect(screen.getByRole("status")).toContainText(
		"Saved to Documents as SuperShare error report 2026-11-16 18-30-05.txt",
	);
	const saved = JSON.parse(
		(await page.locator("html").getAttribute("data-saved-report")) ?? "{}",
	);
	expect(saved.reason).toBe("crash");
	expect(saved.error.message).toContain("reading 'clips'");
	expect(saved.error.stack).toContain("TypeError");
	expect(saved.error.componentStack).toContain("Bomb");
	expect(saved.exportSettings).toEqual({ exportFormat: "mp4", exportQuality: "good" });
	const logs = saved.logs.join("\n");
	expect(logs).toContain("/Users/test/Recordings/Demo/Demo.ssup");
	expect(logs).not.toContain("hunter22");
	if (shots) await page.screenshot({ path: `${shots}/crash-editor-light.png` });

	await screen.getByRole("button", { name: "Show in Finder" }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-revealed",
		"/Users/test/Documents/SuperShare error report 2026-11-16 18-30-05.txt",
	);

	await page.evaluate(() => {
		document.documentElement.dataset.recover = "true";
	});
	await screen.getByRole("button", { name: "Try again" }).click();
	await expect(page.getByText("Recovered")).toBeVisible();
	await expect(screen).toHaveCount(0);
});

test("the crash screen follows dark mode", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/tests/ui/crash-screen.html?window=editor");
	await expect(page.getByRole("alertdialog", { name: "Something went wrong" })).toBeVisible();
	await expect(page.locator("html")).toHaveClass(/dark/);
	if (shots) await page.screenshot({ path: `${shots}/crash-editor-dark.png` });
});

test("the recording bar's crash bar still stops the recording", async ({ page }) => {
	await page.setViewportSize({ width: 420, height: 120 });
	await page.goto("/tests/ui/crash-screen.html?window=recording-controls");
	const bar = page.getByRole("alert", { name: "The recording bar stopped working" });
	await expect(bar).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-content-size", /^\d+x54$/);
	await bar.getByRole("button", { name: "Stop recording" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-command", "stop");
	await bar.getByRole("button", { name: "Save report" }).click();
	await expect(bar.getByRole("button", { name: "Report saved" })).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-revealed", /error report/);
	if (shots) await page.screenshot({ path: `${shots}/crash-recording-bar.png` });
});

test("a failed capture picker can be closed", async ({ page }) => {
	await page.goto("/tests/ui/crash-screen.html?window=capture-picker");
	const screen = page.getByRole("alertdialog", { name: "Something went wrong" });
	await expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
});

test("a failed countdown just goes away", async ({ page }) => {
	await page.goto("/tests/ui/crash-screen.html?window=countdown");
	await expect(page.locator("#root")).toBeEmpty();
});
