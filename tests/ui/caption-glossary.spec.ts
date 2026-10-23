import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
test("app-wide glossary reaches caption generation and survives reload", async ({ page }) => {
	test.setTimeout(60000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.addInitScript(() => {
		const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI;
		const read = api.getAppSetting as (key: string) => unknown;
		Object.assign(api, {
			getAppSetting: (key: string) => {
				const stored = sessionStorage.getItem(`setting:${key}`);
				return stored === null ? read(key) : JSON.parse(stored);
			},
			setAppSetting: (key: string, value: unknown) => {
				sessionStorage.setItem(`setting:${key}`, JSON.stringify(value));
				return true;
			},
			getWhisperSmallModelStatus: async () => ({
				success: true,
				exists: true,
				path: "/model.bin",
			}),
			generateAutoCaptions: async (options: unknown) => {
				sessionStorage.setItem("captionRequest", JSON.stringify(options));
				return { success: true, cues: [] };
			},
		});
	});
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 20000,
	});
	await page.getByRole("radio", { name: "Captions", exact: true }).click();
	await page.getByRole("textbox", { name: "Glossary" }).fill("Jane Doe, Starlight");
	await page.reload();
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 20000,
	});
	await page.getByRole("radio", { name: "Captions", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Glossary" })).toHaveValue(
		"Jane Doe, Starlight",
	);
	await page.evaluate(() => {
		const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI;
		api.getCurrentRecordingSession = async () => ({ success: false });
		api.getCurrentVideoPath = async () => ({ success: true, path: "/recordings/clip.mp4" });
	});
	await page.getByRole("button", { name: "Generate Captions" }).click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("captionRequest")))
		.not.toBeNull();
	const request = JSON.parse(
		(await page.evaluate(() => sessionStorage.getItem("captionRequest")))!,
	);
	expect(request.prompt).toBe("Jane Doe, Starlight");
});
