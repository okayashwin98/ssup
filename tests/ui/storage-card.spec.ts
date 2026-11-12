import { expect, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

test("sidebar shows this computer's storage: the app, everything else and free space", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		Object.assign(window.electronAPI, {
			getLocalStorageUsage: async () => ({
				success: true,
				totalBytes: 994_662_584_320,
				freeBytes: 197_320_437_760,
				appBytes: 3_139_788_800,
			}),
			cloudShareManage: async () => ({
				success: true,
				videos: [{ size: 1_200_000_000 }, { size: 300_000_000 }],
			}),
		});
	});
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Home", exact: true }).click();
	const local = page.getByRole("region", { name: "Local storage" });
	await expect(local).toContainText("994.7 GB");
	await expect(local.getByRole("listitem")).toHaveText([
		"SuperShare3.1 GB",
		"Everything else794.2 GB",
		"Free197.3 GB",
	]);
	await expect(local.getByRole("img")).toHaveAccessibleName(
		"SuperShare 3.1 GB, everything else 794.2 GB, free 197.3 GB",
	);
	// When the cloud meter is on, both sit in one box with a line between them.
	const cloud = page.getByRole("region", { name: "Cloud storage" });
	if (await cloud.count()) {
		await expect(cloud).toContainText("1.5 GB of 10 GB used");
		const box = page.locator("div:has(> section[aria-label='Cloud storage'])");
		await expect(box.locator("> hr")).toHaveCount(1);
		await expect(box.locator("> section[aria-label='Local storage']")).toHaveCount(1);
	}
	const sidebar = page.getByRole("complementary", { name: "Library navigation" });
	await sidebar.screenshot({
		path: "test-results/storage-card-light.png",
		animations: "disabled",
	});
	await page.emulateMedia({ colorScheme: "dark" });
	await sidebar.screenshot({
		path: "test-results/storage-card-dark.png",
		animations: "disabled",
	});
});
