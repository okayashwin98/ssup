import path from "node:path";
import { expect, test } from "@playwright/test";

test("signed-out profile previews a picked photo before saving", async ({ page }) => {
	await page.goto("/tests/ui/local-profile.html");
	const form = page.getByRole("form", { name: "Profile settings" });
	await expect(form).toBeVisible();
	const preview = form.locator("img");
	await expect(preview).toHaveCount(0);

	await form
		.getByLabel("Profile photo")
		.setInputFiles(path.join(import.meta.dirname, "fixtures/recording-thumbnail.jpg"));
	await expect(preview).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
	await expect(form.getByRole("button", { name: "Save profile" })).toBeEnabled();

	await form.getByRole("button", { name: "Remove" }).click();
	await expect(preview).toHaveCount(0);
});
