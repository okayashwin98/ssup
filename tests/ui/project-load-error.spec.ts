import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

const shots = process.env.SUPERSHARE_SCREENSHOT_DIR;

async function openBrokenProject(page: Page, failure: Record<string, unknown>) {
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(
		page,
		(failure) => {
			window.electronAPI.listProjectFiles = async () => ({
				success: true,
				entries: [
					{
						path: "/Users/me/Recordings/Demo/Demo.ssup",
						name: "Demo",
						updatedAt: 1757000000000,
						thumbnailPath: null,
						isCurrent: false,
						isInProjectsDirectory: true,
					},
				],
			});
			window.electronAPI.openProjectFileAtPath = async () => {
				const html = document.documentElement;
				html.dataset.opens = String(Number(html.dataset.opens || 0) + 1);
				return failure as never;
			};
			window.electronAPI.saveErrorReport = async (input) => {
				document.documentElement.dataset.savedReport = JSON.stringify(input);
				return {
					success: true,
					path: "/Users/me/Documents/SuperShare error report 2026-11-16 18-30-05.txt",
					askedWhere: false,
				};
			};
		},
		failure,
	);
	await page.goto("/?windowType=editor");
	await expect(page.locator("html")).toHaveAttribute("data-project-creates", "1");
	await page.getByRole("button", { name: "Home", exact: true }).click();
	const home = page.getByRole("dialog", { name: "Projects dashboard", exact: true });
	await home.getByRole("button", { name: "Demo", exact: true }).click();
	return page.getByRole("alertdialog");
}

test("a project whose recording is missing shows why, and offers ways out", async ({ page }) => {
	const screen = await openBrokenProject(page, {
		success: false,
		code: "missing-recording",
		message: "Project video file not found: /Users/me/Recordings/Demo/take.mp4",
		projectPath: "/Users/me/Recordings/Demo/Demo.ssup",
		recordingPath: "/Users/me/Recordings/Demo/take.mp4",
	});
	await expect(screen).toHaveAccessibleName("The project’s recording is missing");
	await expect(screen.getByText("Demo.ssup", { exact: true })).toBeVisible();
	await expect(
		screen.getByText("Recording: /Users/me/Recordings/Demo/take.mp4", { exact: true }).first(),
	).toBeVisible();
	await expect(page.getByRole("dialog", { name: "Projects dashboard" })).toHaveCount(0);
	const savesBefore = await page.locator("html").getAttribute("data-project-saves");
	if (shots) await page.screenshot({ path: `${shots}/project-error-missing-light.png` });

	await screen.getByRole("button", { name: "Save report" }).click();
	await expect(screen.getByRole("status")).toContainText("Saved to Documents as");
	const saved = JSON.parse(
		(await page.locator("html").getAttribute("data-saved-report")) ?? "{}",
	);
	expect(saved.reason).toBe("project-load");
	expect(saved.error.message).toContain("Recording: /Users/me/Recordings/Demo/take.mp4");

	await screen.getByRole("button", { name: "Try again" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-opens", "2");
	await expect(screen).toBeVisible();
	// Showing the error never saves over the project.
	expect(await page.locator("html").getAttribute("data-project-saves")).toBe(savesBefore);

	await screen.getByRole("button", { name: "Back to Home" }).click();
	await expect(
		page.getByRole("dialog", { name: "Projects dashboard", exact: true }),
	).toBeVisible();
});

test("a recording on a disconnected drive names the drive, in dark mode too", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" });
	const screen = await openBrokenProject(page, {
		success: false,
		code: "drive-disconnected",
		message: "Project video file not found: /Volumes/Studio SSD/take.mp4",
		projectPath: "/Users/me/Recordings/Demo/Demo.ssup",
		recordingPath: "/Volumes/Studio SSD/take.mp4",
		driveName: "Studio SSD",
	});
	await expect(screen).toHaveAccessibleName("The recording is on a drive that isn’t connected");
	await expect(screen).toContainText("Connect “Studio SSD” and try again");
	if (shots) await page.screenshot({ path: `${shots}/project-error-drive-dark.png` });
});

test("an unreadable project says so and offers no Locate", async ({ page }) => {
	const screen = await openBrokenProject(page, {
		success: false,
		code: "corrupt",
		message: "Invalid project file format",
		projectPath: "/Users/me/Recordings/Demo/Demo.ssup",
	});
	await expect(screen).toHaveAccessibleName("This project couldn’t be read");
	await expect(screen.getByRole("button", { name: "Locate recording" })).toHaveCount(0);
	if (shots) await page.screenshot({ path: `${shots}/project-error-corrupt-light.png` });
});
