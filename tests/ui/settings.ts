import type { Page } from "@playwright/test";

/** Settings live in the dashboard (Home); the editor's sidebar has Motion instead. */
export async function openDashboardSettings(page: Page) {
	const dashboard = page.getByRole("dialog", { name: "Projects dashboard", exact: true });
	if (!(await dashboard.isVisible()))
		await page.getByRole("button", { name: "Home", exact: true }).click();
	await dashboard.getByRole("button", { name: "Settings", exact: true }).click();
	return dashboard;
}
