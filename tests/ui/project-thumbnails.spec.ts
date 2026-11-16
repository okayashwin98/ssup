import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
	test(`Home cards swap a raw frame for the finished edit in the background (${theme})`, async ({
		page,
	}) => {
		test.setTimeout(60000);
		await page.goto(`/tests/ui/project-thumbnails.html?theme=${theme}`);
		const card = (name: string) => page.getByRole("listitem", { name });
		// The raw frame shows first, so Home never waits for a render.
		await expect(card("Raw frame, edited project").locator("img")).toHaveAttribute(
			"src",
			/recording-thumbnail\.jpg/,
		);
		await page.evaluate(() => window.dispatchEvent(new Event("release-renders")));
		for (const name of ["Raw frame, edited project", "Old project, no saved look"])
			await expect(card(name).locator("img[data-composed-thumbnail]")).toHaveAttribute(
				"src",
				/^data:image\/png;base64,/,
				{ timeout: 30000 },
			);
		// Saved for next time, one per project that needed it.
		await expect(page.locator("html")).toHaveAttribute(
			"data-cached",
			"/projects/styled.supershare:true,/projects/old.supershare:true",
		);
		// A failed render keeps the current preview; a finished one is not rendered again.
		await expect(card("Recording missing").locator("img")).toHaveAttribute(
			"src",
			/recording-thumbnail\.jpg/,
		);
		await expect(card("Already finished edit").locator("img")).toHaveAttribute(
			"src",
			/recording-thumbnail\.jpg/,
		);
		await expect(page.locator("html")).toHaveAttribute("data-preview-reads", "3");
		// The composed image carries the saved background colour at its edge.
		const corner = await card("Raw frame, edited project")
			.locator("img[data-composed-thumbnail]")
			.evaluate(async (image: HTMLImageElement) => {
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth;
				canvas.height = image.naturalHeight;
				const context = canvas.getContext("2d")!;
				context.drawImage(image, 0, 0);
				return [canvas.width, canvas.height, ...context.getImageData(3, 3, 1, 1).data];
			});
		expect(corner.slice(0, 2)).toEqual([640, 480]);
		// #8fa8b9
		expect(Math.abs(corner[2] - 0x8f)).toBeLessThan(12);
		expect(Math.abs(corner[3] - 0xa8)).toBeLessThan(12);
		expect(Math.abs(corner[4] - 0xb9)).toBeLessThan(12);
		await page.screenshot({
			path: `screenshots/port/home-thumbnails-${theme}.png`,
			clip: { x: 0, y: 0, width: 1440, height: 340 },
		});
	});
}
