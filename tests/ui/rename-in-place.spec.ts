import { expect, type Locator, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

type Area = { x: number; y: number; width: number; height: number };

/**
 * Where the name's letters are drawn: the dark pixels inside `area`, read from a screenshot
 * so line boxes and field padding can't skew it. Light theme, so the text is the dark ink.
 */
async function ink(page: Page, area: Area) {
	await page.mouse.move(1, 1);
	await page.waitForTimeout(200);
	const shot = (await page.screenshot({ clip: area, animations: "disabled" })).toString("base64");
	return page.evaluate(async (data) => {
		const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
		const image = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext("2d")!;
		context.drawImage(image, 0, 0);
		const {
			data: pixels,
			width,
			height,
		} = context.getImageData(0, 0, width_(image), image.height);
		function width_(bitmap: ImageBitmap) {
			return bitmap.width;
		}
		let top = height;
		let bottom = -1;
		let left = width;
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4;
				const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
				const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
				if (high < 110 && high - low < 40) {
					top = Math.min(top, y);
					bottom = Math.max(bottom, y);
					left = Math.min(left, x);
				}
			}
		return { top, bottom, left };
	}, shot);
}

/** Same spot to within a pixel: a name on a half pixel can't match a field's whole-pixel text. */
function expectSameInk(after: Ink, before: Ink) {
	for (const key of ["top", "bottom", "left"] as const)
		expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1);
}
type Ink = { top: number; bottom: number; left: number };

/** The first letters of the shown name, with room for the field's own padding around them. */
async function nameArea(name: Locator): Promise<Area> {
	return name.evaluate((node) => {
		const range = document.createRange();
		range.selectNodeContents(node);
		const rect = range.getBoundingClientRect();
		return {
			x: Math.floor(rect.left) - 3,
			y: Math.floor(rect.top) - 6,
			width: Math.min(28, Math.ceil(rect.width)) + 6,
			height: Math.ceil(rect.height) + 12,
		};
	});
}

/** Starts renaming, then hides the caret and selection so only the letters are dark. */
async function startRename(field: Locator, start: () => Promise<void>) {
	await start();
	await expect(field).toBeFocused();
	await field.evaluate((node: HTMLInputElement) => {
		node.style.caretColor = "transparent";
		node.setSelectionRange(node.value.length, node.value.length);
	});
}

async function openHome(page: Page) {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.listProjectFiles = async () => ({
			success: true,
			projects: [],
			entries: [
				{
					path: "/projects/demo.recordly",
					name: "Design review",
					updatedAt: Date.now(),
					thumbnailPath: null,
					isCurrent: false,
					isInProjectsDirectory: true,
				},
			],
		});
		localStorage.setItem(
			"recordly.project-folders.v1",
			JSON.stringify([{ id: "f", name: "Loom", color: "#929292", paths: [] }]),
		);
	});
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Home", exact: true }).click();
	return page.getByRole("dialog", { name: "Projects dashboard" });
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ colorScheme: "light" });
});

test("renaming a project card leaves the name and the card where they were", async ({ page }) => {
	const home = await openHome(page);
	const card = home.getByRole("list", { name: "Your projects" }).locator("li").first();
	const cardBox = await card.boundingBox();
	const area = await nameArea(card.getByText("Design review", { exact: true }));
	const before = await ink(page, area);
	await startRename(home.getByRole("textbox", { name: "Project name" }), async () => {
		await home.getByRole("button", { name: "Options for Design review" }).click();
		await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
	});
	expectSameInk(await ink(page, area), before);
	expect(await card.boundingBox()).toEqual(cardBox);
});

test("renaming a folder leaves the name and the row where they were", async ({ page }) => {
	const home = await openHome(page);
	const row = home.locator(".folder-row").first();
	const rowBox = await row.boundingBox();
	const area = await nameArea(row.getByText("Loom", { exact: true }));
	const before = await ink(page, area);
	await startRename(home.getByRole("textbox", { name: "Folder name" }), async () => {
		await home.getByRole("button", { name: "Options for Loom" }).click();
		await page.getByRole("menuitem", { name: "Rename" }).click();
	});
	expectSameInk(await ink(page, area), before);
	expect(await row.boundingBox()).toEqual(rowBox);
});

test("renaming the project in the editor title leaves the name where it was", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const title = page.getByRole("button", { name: "Rename project" });
	await expect(title).toBeVisible({ timeout: 15000 });
	const clips = page.getByRole("button", { name: "Clips", exact: true });
	const clipsBox = await clips.boundingBox();
	const area = await nameArea(title.locator("span").first());
	const before = await ink(page, area);
	await startRename(page.locator(".editor-header-title input"), () => title.click());
	expectSameInk(await ink(page, area), before);
	expect(await clips.boundingBox()).toEqual(clipsBox);
});

test("renaming a saved preset leaves the name where it was", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Open presets", exact: true }).click();
	const presets = page.getByRole("dialog", { name: "Presets", exact: true });
	await presets.getByRole("textbox", { name: "Preset name" }).fill("Design review");
	await presets.getByRole("button", { name: "Save", exact: true }).click();
	const update = presets.getByRole("button", {
		name: "Update Design review with current settings",
	});
	const options = presets.getByRole("button", { name: "Preset options", exact: true });
	const row = update.locator("..");
	const rowBox = await row.boundingBox();
	const optionsBox = await options.boundingBox();
	const area = await nameArea(presets.getByText("Design review", { exact: true }));
	const before = await ink(page, area);
	// The new-preset field shares the label, so the rename field is the second one.
	await startRename(presets.getByRole("textbox", { name: "Preset name" }).nth(1), async () => {
		await options.click();
		await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
	});
	expectSameInk(await ink(page, area), before);
	expect(await row.boundingBox()).toEqual(rowBox);
	expect(await options.boundingBox()).toEqual(optionsBox);
});
