import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

/** Loads `project` as the editor's current project and records every save. */
async function openProject(page: import("@playwright/test").Page, editor: unknown) {
	await installDesktopBridge(page);
	await page.addInitScript((editor) => {
		const saves: unknown[] = [];
		(window as unknown as { __saves: unknown[] }).__saves = saves;
		const install = () => {
			window.electronAPI.loadCurrentProjectFile = async () => ({
				success: true,
				path: "/projects/Imported/Imported.ssup",
				project: {
					version: 2,
					projectId: "p1",
					videoPath: `${location.origin}/tests/ui/fixtures/preview.mp4`,
					editor,
				},
			});
			window.electronAPI.saveProjectFile = async (
				data: unknown,
				_n: string,
				path: string,
			) => {
				saves.push(JSON.parse(JSON.stringify(data)));
				return { success: true, path, projectId: "p1" };
			};
			window.electronAPI.createProjectFile = async (data: unknown) => {
				saves.push(JSON.parse(JSON.stringify(data)));
				return { success: true, path: "/projects/new.ssup", projectId: "p1" };
			};
		};
		if (window.electronAPI) install();
		else queueMicrotask(install);
	}, editor);
	await page.goto("/?windowType=editor");
	await expect(page.locator("video").first()).toHaveJSProperty("readyState", 4, {
		timeout: 20000,
	});
	await page.waitForTimeout(2500);
}

const saves = (page: import("@playwright/test").Page) =>
	page.evaluate(() => (window as unknown as { __saves: unknown[] }).__saves);

test("opening a project and looking around never saves it; a real edit does", async ({ page }) => {
	// An imported project: no editor settings saved yet, so the editor fills them in.
	await openProject(page, {});
	expect(await saves(page)).toHaveLength(0);

	// Play, pause, seek and switch panels: still not an edit.
	await page.keyboard.press("Space");
	await page.waitForTimeout(600);
	await page.keyboard.press("Space");
	await page.keyboard.press("ArrowRight");
	for (const name of ["Cursor", "Webcam", "Scene"]) {
		const tab = page.getByRole("radio", { name, exact: true });
		if (await tab.count()) await tab.click();
	}
	await page.waitForTimeout(1500);
	expect(await saves(page)).toHaveLength(0);

	// A real edit is saved.
	await page
		.getByRole("button", { name: /wallpaper|background/i })
		.nth(3)
		.click();
	await expect.poll(async () => (await saves(page)).length, { timeout: 5000 }).toBeGreaterThan(0);
	const [saved] = (await saves(page)) as { editor: { wallpaper?: string } }[];
	expect(saved.editor.wallpaper).not.toBe("/wallpapers/tahoe-light.jpg");
});

test("reopening a project the app saved does not save it again", async ({ page }) => {
	await openProject(page, {
		wallpaper: "/wallpapers/tahoe-light.jpg",
		zoomInDurationMs: 200,
		zoomInOverlapMs: 500,
		clipRegions: [{ id: "clip-1", startMs: 0, endMs: 6000, speed: 1 }],
	});
	await page.waitForTimeout(1500);
	expect(await saves(page)).toHaveLength(0);
});
