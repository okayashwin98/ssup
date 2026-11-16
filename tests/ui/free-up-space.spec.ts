import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
	test(`Free up space shows what moves and its size, then asks before moving (${theme})`, async ({
		page,
	}) => {
		await page.goto(`/tests/ui/free-up-space.html?theme=${theme}`);
		await expect(page.getByText("7.8 GB")).toBeVisible();
		await page.getByRole("button", { name: "Free up space…" }).click();
		const dialog = page.getByRole("dialog", { name: "Free up space" });
		const list = dialog.getByRole("list", { name: "Recordings to move to Trash" });
		await expect(list.getByRole("listitem")).toHaveCount(4);
		await expect(list.getByRole("listitem").nth(1)).toContainText(
			"In the “Pricing page tour” folder · 3 files",
		);
		await expect(dialog.getByRole("button", { name: "Move to Trash · 4.7 GB" })).toBeVisible();
		await page.waitForTimeout(600);
		await page.screenshot({ path: `screenshots/port/free-up-space-review-${theme}.png` });

		// Unticking one updates the total; nothing has moved yet.
		await list.getByRole("listitem").nth(2).getByRole("button").click();
		await expect(dialog.getByRole("button", { name: "Move to Trash · 4.6 GB" })).toBeVisible();
		await dialog.getByRole("button", { name: "Move to Trash · 4.6 GB" }).click();
		await expect(dialog).toContainText("Move 3 recordings (11 files, 4.6 GB) to the Trash?");
		await expect(page.locator("html")).not.toHaveAttribute("data-trashed", /.*/);
		await page.waitForTimeout(600);
		await page.screenshot({ path: `screenshots/port/free-up-space-confirm-${theme}.png` });

		await dialog.getByRole("button", { name: "Move to Trash", exact: true }).click();
		await expect(dialog).toContainText("Moved 2 recordings (2.3 GB) to the Trash.");
		await expect(dialog).toContainText("1 recording kept because a project now uses it.");
		const trashed = JSON.parse(
			(await page.locator("html").getAttribute("data-trashed")) ?? "[]",
		);
		expect(trashed).toHaveLength(3);
		expect(trashed.some((path: string) => path.includes("1793704800000"))).toBe(false);
		await page.waitForTimeout(600);
		await page.screenshot({ path: `screenshots/port/free-up-space-done-${theme}.png` });
		await dialog.getByRole("button", { name: "Done" }).click();
		await expect(page.getByText("3.1 GB")).toBeVisible();
	});
}

test("Free up space says when there is nothing to move, and while recording", async ({ page }) => {
	await page.goto("/tests/ui/free-up-space.html?empty");
	await page.getByRole("button", { name: "Free up space…" }).click();
	await expect(
		page.getByText("Nothing to clean up. Every recording is used by a project."),
	).toBeVisible();
	await page.goto("/tests/ui/free-up-space.html?busy");
	await page.getByRole("button", { name: "Free up space…" }).click();
	await expect(page.getByRole("alert")).toHaveText(
		"Finish or stop the recording first, then try again.",
	);
});
