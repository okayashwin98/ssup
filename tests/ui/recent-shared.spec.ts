import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

async function mockShareService(page: Page) {
	const thumb = await fs.readFile("tests/ui/fixtures/recording-thumbnail.jpg");
	const video = await fs.readFile("tests/ui/fixtures/preview.mp4");
	await page.route("https://share.example.test/**", (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname.startsWith("/thumb/"))
			return route.fulfill({ body: thumb, contentType: "image/jpeg" });
		if (pathname.startsWith("/v/"))
			return route.fulfill({ body: video, contentType: "video/mp4" });
		return route.fulfill({ status: 404 });
	});
}

for (const theme of ["light", "dark"] as const) {
	test(`Home lists the newest finished shares and opens them (${theme})`, async ({ page }) => {
		await mockShareService(page);
		await page.goto(`/tests/ui/recent-shared.html?theme=${theme}`);
		const row = page.getByRole("region", { name: "Recently shared" });
		await expect(row.getByRole("button", { name: /^Open / })).toHaveCount(7);
		// Asked the configured share service with the configured key; no sign-in involved.
		await expect(page.locator("html")).toHaveAttribute(
			"data-request",
			"list:fixture-key:https://share.example.test/api/upload",
		);
		await expect(row.getByText("Unfinished upload")).toHaveCount(0);
		await expect(row.getByRole("listitem").first()).toContainText("Product walkthrough");
		// The grid's heading carries how many projects it lists.
		await expect(page.getByRole("heading", { name: "Projects 24" })).toBeVisible();
		await expect(page.getByText(/sign in/i)).toHaveCount(0);
		await expect
			.poll(() =>
				row
					.locator("img")
					.first()
					.evaluate((image: HTMLImageElement) => image.naturalWidth),
			)
			.toBeGreaterThan(0);
		await page.screenshot({
			path: `screenshots/port/home-recently-shared-${theme}.png`,
			clip: { x: 0, y: 0, width: 1440, height: 370 },
		});
		await row
			.getByRole("button", { name: "Open Bug repro: export stalls in the browser" })
			.click();
		await expect(page.locator("html")).toHaveAttribute(
			"data-opened",
			"https://share.example.test/s/demo2",
		);
		await row.getByRole("button", { name: "View all" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-view-all", "true");
	});

	test(`a published video plays in place after sharing (${theme})`, async ({ page }) => {
		await mockShareService(page);
		await page.goto(`/tests/ui/recent-shared.html?preview&theme=${theme}`);
		const play = page.getByRole("button", { name: "Play shared video" });
		await expect(play).toBeVisible();
		await page.waitForTimeout(500);
		await page.screenshot({
			path: `screenshots/port/published-preview-${theme}.png`,
			clip: { x: 0, y: 0, width: 560, height: 300 },
		});
		await play.click();
		await expect(play).toHaveCount(0);
		await expect
			.poll(() =>
				page
					.getByLabel("Shared video preview")
					.evaluate((video: HTMLVideoElement) => video.currentTime),
			)
			.toBeGreaterThan(0);
	});
}

test("the row stays hidden when the service has nothing finished, and offers a retry when unreachable", async ({
	page,
}) => {
	await page.goto("/tests/ui/recent-shared.html?empty");
	await expect(page.locator("html")).toHaveAttribute("data-reads", "1");
	await expect(page.getByRole("region", { name: "Recently shared" })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Projects" })).toHaveCount(0);
	await page.goto("/tests/ui/recent-shared.html?fails");
	const row = page.getByRole("region", { name: "Recently shared" });
	await expect(row).toContainText("Couldn't load your shared videos.");
	await row.getByRole("button", { name: "Try again" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-reads", "2");
	await page.screenshot({
		path: "screenshots/port/home-recently-shared-error-light.png",
		clip: { x: 0, y: 0, width: 1440, height: 120 },
	});
});

test("without a share key Home shows no shared row and no sign-in prompt", async ({ page }) => {
	// The test server blanks the share address and key, as a build without them would be.
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getCurrentVideoPath = async () => ({ success: false });
		localStorage.setItem("recordly.open-dashboard", String(Date.now()));
	});
	await page.goto("/?windowType=editor");
	const home = page.getByRole("dialog", { name: "Projects dashboard", exact: true });
	await expect(home.getByRole("textbox", { name: "Search projects" })).toBeVisible();
	await expect(home.getByRole("region", { name: "Recently shared" })).toHaveCount(0);
	await expect(home.getByText(/recently shared|sign in|log in/i)).toHaveCount(0);
});
