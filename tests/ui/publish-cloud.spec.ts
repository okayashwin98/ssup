import { expect, test } from "@playwright/test";

test("publish preserves local destination and stays open throughout sharing", async ({ page }) => {
	await page.goto("/tests/ui/publish.html?switch");
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await page.getByRole("row", { name: "Local", exact: true }).click();
	await expect(page.getByRole("button", { name: "Export Video", exact: true })).toBeVisible();
	await page.reload();
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByRole("row", { name: "Local", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await page.getByRole("row", { name: "Link", exact: true }).click();
	await page.getByRole("button", { name: "Share", exact: true }).click();
	await expect(page.getByText(/Uploading ·/)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByText(/Uploading ·/)).toBeVisible();
	await expect(page.getByRole("row", { name: "Local", exact: true })).toHaveAttribute(
		"aria-disabled",
		"true",
	);
	await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible({
		timeout: 20000,
	});
	await page
		.getByRole("button", { name: "Fixture refresh token", exact: true })
		.evaluate((button: HTMLButtonElement) => button.click());
	await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
});

test("shared cards open ready links and delete incomplete uploads", async ({ page }) => {
	await page.goto("/tests/ui/shared-recordings.html");
	await page.getByRole("button", { name: "Product walkthrough", exact: true }).click();
	await expect(page.getByRole("status")).toHaveText("Opened https://example.test/s/demo1");
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toBeDisabled();
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.dismiss());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toHaveCount(1);
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toHaveCount(0);
	await page.getByRole("textbox", { name: "Search projects" }).fill("missing");
	await expect(page.getByText("No matching projects", { exact: true })).toBeVisible();
});

test("without the share password the Link panel says sharing is unavailable", async ({ page }) => {
	await page.goto("/tests/ui/publish.html?switch");
	await page
		.getByRole("button", { name: "Fixture remove password", exact: true })
		.evaluate((button: HTMLButtonElement) => button.click());
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await page.getByRole("row", { name: "Link", exact: true }).click();
	await expect(page.getByText(/Cloud sharing is not available in this build yet/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
	await expect(page.getByText(/sign in/i)).toHaveCount(0);
});

test("shared cards can be renamed", async ({ page }) => {
	await page.goto("/tests/ui/shared-recordings.html");
	await page
		.getByRole("button", { name: "Options for Product walkthrough", exact: true })
		.click();
	await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
	const input = page.getByRole("textbox", { name: "Project name" });
	await input.fill("Site walkthrough");
	await input.press("Enter");
	await expect(page.getByRole("button", { name: "Site walkthrough", exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Product walkthrough", exact: true }),
	).toHaveCount(0);
});

test("a failed rename shows a clear message that clears on the next action", async ({ page }) => {
	await page.goto("/tests/ui/shared-recordings.html?renameFails");
	await page
		.getByRole("button", { name: "Options for Product walkthrough", exact: true })
		.click();
	await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
	const input = page.getByRole("textbox", { name: "Project name" });
	await input.fill("Site walkthrough");
	await input.press("Enter");
	await expect(page.getByText("Could not rename recording: Not found")).toBeVisible();
	await page.getByRole("button", { name: "Product walkthrough", exact: true }).click();
	await expect(page.getByText("Could not rename recording: Not found")).toHaveCount(0);
});

test("Link offers upload sizes up to the recording's own, 1080p first", async ({ page }) => {
	await page.goto("/tests/ui/publish.html");
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await page.getByRole("row", { name: "Link", exact: true }).click();
	const sizes = page.getByRole("grid", { name: "Resolution" }).getByRole("row");
	// The fixture's recording is 3024 × 1898: 4K would be larger than it.
	await expect(sizes).toHaveText(["720p", "1080p", "1440p"]);
	await expect(page.getByRole("row", { name: "1080p", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await page.getByRole("row", { name: "1440p", exact: true }).click();
	await page.reload();
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByRole("row", { name: "1440p", exact: true })).toHaveAttribute(
		"aria-selected",
		"true",
	);
});
