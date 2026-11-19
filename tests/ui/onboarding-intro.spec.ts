import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { openDashboardSettings } from "./settings";

test.use({
	channel: process.env.RECORDLY_TEST_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined,
});

/** A fresh install: settings live in localStorage so a reload keeps them. */
async function freshInstall(page: Page) {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getAppSetting = (key) => JSON.parse(localStorage.getItem(key) || "null");
		window.electronAPI.setAppSetting = (key, value) => {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		};
		const status = window.electronAPI.getScreenRecordingPermissionStatus;
		window.electronAPI.getScreenRecordingPermissionStatus = async () => {
			// Recorded so the test can see the check runs while the intro is still showing.
			(
				window as unknown as { permissionCheckedDuringIntro?: boolean }
			).permissionCheckedDuringIntro ||=
				document.querySelector("[data-onboarding-intro]") !== null;
			return status();
		};
	});
}

const intro = (page: Page) => page.locator("[data-onboarding-intro]");
const welcome = (page: Page) => page.getByRole("dialog", { name: "Welcome to SuperShare" });

test("first launch plays the intro once, then hands over to the welcome", async ({ page }) => {
	await freshInstall(page);
	// The page's clock is moved on by hand, in step with real time and at most 50 ms at a
	// time, until the intro shows; it then stands still while the intro is checked, so a busy
	// machine can neither miss it nor stretch how long it lasts.
	await page.clock.install({ time: new Date("2026-01-01T09:00:00") });
	await page.clock.pauseAt(new Date("2026-01-01T09:00:01"));
	await page.goto("/?windowType=editor");
	const step = 50;
	for (let last = Date.now(), deadline = last + 20000; (await intro(page).count()) === 0; ) {
		if (Date.now() > deadline) throw new Error("The intro never appeared");
		const now = Date.now();
		await page.clock.runFor(Math.max(1, Math.min(step, now - last)));
		last = now;
	}
	await expect(intro(page)).toBeVisible();
	await expect(intro(page).getByText("SuperShare", { exact: true })).toBeVisible();
	await expect(intro(page).locator("img")).toHaveJSProperty("complete", true);
	expect(
		await intro(page)
			.locator("img")
			.evaluate((img: HTMLImageElement) => img.naturalWidth),
	).toBe(512);
	// Gone under 2.5 s from when it was first seen (it appeared at most one step ago).
	await page.clock.runFor(2500 - step);
	await expect(intro(page)).toHaveCount(0);
	await page.clock.resume();
	await expect(
		welcome(page).getByRole("heading", { name: "Allow SuperShare to record" }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { permissionCheckedDuringIntro?: boolean })
					.permissionCheckedDuringIntro,
		),
	).toBe(true);
	expect(await page.evaluate(() => localStorage.getItem("supershare.onboarding.introSeen"))).toBe(
		"true",
	);
	// The welcome was not finished, so it opens again, but the intro never does.
	await page.reload();
	await expect(
		welcome(page).getByRole("heading", { name: "Allow SuperShare to record" }),
	).toBeVisible();
	await page.waitForTimeout(500);
	await expect(intro(page)).toHaveCount(0);
});

test("Escape and a click skip the intro without closing or pressing anything in the welcome", async ({
	page,
}) => {
	await freshInstall(page);
	await page.goto("/?windowType=editor");
	await expect(intro(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(intro(page)).toHaveCount(0, { timeout: 600 });
	await expect(welcome(page)).toBeVisible();

	await page.evaluate(() => localStorage.removeItem("supershare.onboarding.introSeen"));
	await page.reload();
	await expect(intro(page)).toBeVisible();
	// Where Start recording sits underneath.
	const start = welcome(page).getByRole("button", { name: "Start recording", exact: true });
	const box = await start.boundingBox();
	if (!box) throw new Error("No Start recording button");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(intro(page)).toHaveCount(0, { timeout: 600 });
	await expect(welcome(page)).toBeVisible();
	await expect(page.locator("html")).not.toHaveAttribute("data-hud-opened", "true");
});

test("reduced motion shows the lockup without movement and fades quickly", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await freshInstall(page);
	await page.goto("/?windowType=editor");
	// Read the intro in the first frame it shows: the reduced-motion version is brief, and a
	// busy machine can miss it between separate checks. Its quick fade only changes opacity,
	// so only animations that move or resize anything count as movement.
	const seen = await (
		await page.waitForFunction(
			() => {
				const node = document.querySelector<HTMLElement>("[data-onboarding-intro]");
				if (!node) return null;
				const bookkeeping = ["offset", "computedOffset", "easing", "composite", "opacity"];
				const moving = node
					.getAnimations({ subtree: true })
					.filter((animation) => animation.playState === "running")
					.filter((animation) =>
						(animation.effect as KeyframeEffect)
							.getKeyframes()
							.some((frame) =>
								Object.keys(frame).some((key) => !bookkeeping.includes(key)),
							),
					).length;
				return { reducedMotion: node.dataset.reducedMotion, moving };
			},
			undefined,
			{ polling: 10 },
		)
	).jsonValue();
	expect(seen).toEqual({ reducedMotion: "true", moving: 0 });
	await expect(intro(page)).toHaveCount(0, { timeout: 1600 });
	await expect(welcome(page)).toBeVisible();
});

test("Settings → Show onboarding replays the intro", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible({
		timeout: 15000,
	});
	await expect(intro(page)).toHaveCount(0);
	await openDashboardSettings(page);
	await page.getByRole("row", { name: "General", exact: true }).click();
	await page.getByRole("button", { name: "Show onboarding" }).click();
	await expect(intro(page)).toBeVisible();
	await expect(intro(page)).toHaveCount(0, { timeout: 4000 });
	await expect(welcome(page)).toBeVisible();
	// Once the intro is gone, Escape closes the welcome as before.
	await page.keyboard.press("Escape");
	await expect(welcome(page)).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
	test(`intro frames (${theme})`, async ({ page }) => {
		await page.clock.install();
		await page.emulateMedia({ colorScheme: theme });
		await freshInstall(page);
		await page.goto("/?windowType=editor");
		if (theme === "dark") {
			await page.evaluate(() => document.documentElement.classList.add("dark"));
		}
		await expect(intro(page)).toBeVisible();
		await expect(intro(page).locator("img")).toHaveJSProperty("complete", true);
		for (const [name, ms] of [
			["start", 120],
			["middle", 440],
			["end", 1200],
		] as const) {
			await intro(page).evaluate((node, time) => {
				for (const animation of node.getAnimations({ subtree: true })) {
					animation.pause();
					animation.currentTime = time;
				}
			}, ms);
			await page.screenshot({ path: `test-results/onboarding-intro-${name}-${theme}.png` });
		}
	});
}
