import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";
import { changedFraction } from "./pixels";

declare global {
	interface Window {
		parity: {
			seek(seconds: number): void;
			exportFrame(
				kind: "legacy" | "modern",
				seconds: number,
				width?: number,
			): Promise<string>;
		};
	}
}

type Upload = { name: string; mimeType: string; buffer: Buffer };
const SOURCE = path.resolve("public/wallpapers/wallpaper1.jpg");

/** Real files in each format, made by macOS's own converter (and Chrome for WebP). */
async function makeUploads(page: Page): Promise<Upload[]> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallpaper-formats-"));
	const sips = (format: string) => {
		const out = path.join(dir, `photo.${format}`);
		execFileSync("/usr/bin/sips", [
			"-z",
			"540",
			"960",
			"-s",
			"format",
			format,
			SOURCE,
			"--out",
			out,
		]);
		return fs.readFileSync(out);
	};
	const fromCanvas = (type: string, transparent: boolean) =>
		page.evaluate(
			async ([mime, hole]) => {
				const canvas = document.createElement("canvas");
				canvas.width = 960;
				canvas.height = 540;
				const ctx = canvas.getContext("2d")!;
				const g = ctx.createLinearGradient(0, 0, 960, 540);
				g.addColorStop(0, "#ff3366");
				g.addColorStop(1, "#3366ff");
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, 960, 540);
				ctx.fillStyle = "#ffffff";
				for (let x = 0; x < 960; x += 80) ctx.fillRect(x, 0, 20, 540);
				if (hole) ctx.clearRect(0, 0, 960, 120);
				const blob = await new Promise<Blob>((done) =>
					canvas.toBlob((b) => done(b!), mime),
				);
				const bytes = new Uint8Array(await blob.arrayBuffer());
				let binary = "";
				for (const byte of bytes) binary += String.fromCharCode(byte);
				return btoa(binary);
			},
			[type, transparent] as const,
		);
	const uploads: Upload[] = [
		{ name: "photo.png", mimeType: "image/png", buffer: sips("png") },
		{
			name: "see-through.png",
			mimeType: "image/png",
			buffer: Buffer.from(await fromCanvas("image/png", true), "base64"),
		},
		{
			name: "photo.webp",
			mimeType: "image/webp",
			buffer: Buffer.from(await fromCanvas("image/webp", false), "base64"),
		},
		{ name: "photo.avif", mimeType: "image/avif", buffer: sips("avif") },
		{ name: "photo.gif", mimeType: "image/gif", buffer: sips("gif") },
		{ name: "photo.bmp", mimeType: "image/bmp", buffer: sips("bmp") },
		{
			name: "drawing.svg",
			mimeType: "image/svg+xml",
			buffer: Buffer.from(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#0f766e"/><circle cx="80" cy="45" r="30" fill="#facc15"/></svg>',
			),
		},
		// iPhone photos often arrive with no file type at all.
		{ name: "IMG_0001.HEIC", mimeType: "", buffer: sips("heic") },
	];
	fs.rmSync(dir, { recursive: true, force: true });
	return uploads;
}

async function openEditor(page: Page) {
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Add wallpaper", exact: true })).toBeVisible({
		timeout: 20000,
	});
	// The mock bridge has no macOS converter; hand back what sips makes of the photo (a PNG).
	const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wallpaper-heic-")), "photo.png");
	execFileSync("/usr/bin/sips", [
		"-z",
		"540",
		"960",
		"-s",
		"format",
		"png",
		SOURCE,
		"--out",
		out,
	]);
	const pngBase64 = fs.readFileSync(out).toString("base64");
	fs.rmSync(path.dirname(out), { recursive: true, force: true });
	await page.evaluate((base64) => {
		window.electronAPI.convertHeicWallpaper = async (bytes: Uint8Array) => {
			document.documentElement.dataset.heicBytes = String(bytes.byteLength);
			return { success: true, data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) };
		};
	}, pngBase64);
}

test.skip(process.platform !== "darwin", "Fixtures are made with macOS sips");

test("every offered image format uploads, shows in the gallery and can be removed", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installDesktopBridge(page);
	await openEditor(page);
	const uploads = await makeUploads(page);
	const input = page.locator('input[type="file"]');
	await expect(input).toHaveAttribute("accept", /\.heic/);
	const custom = page.getByRole("button", { name: "Custom wallpaper 1", exact: true });
	const stored: Record<string, string> = {};
	for (const upload of uploads) {
		await input.setInputFiles(upload);
		await expect(custom, upload.name).toHaveAttribute("aria-pressed", "true");
		const src = (await custom.locator("img").getAttribute("src")) ?? "";
		stored[upload.name] = src;
		await custom.hover();
		await page.getByRole("button", { name: "Remove Custom wallpaper 1", exact: true }).click();
		await expect(custom).toHaveCount(0);
	}
	expect(Number(await page.evaluate(() => document.documentElement.dataset.heicBytes))).toBe(
		uploads.at(-1)?.buffer.byteLength,
	);
	// Every format is stored as one compact JPEG, see-through parts on black.
	for (const [name, src] of Object.entries(stored)) {
		expect(src, name).toMatch(/^data:image\/jpeg;base64,/);
	}
	// Something that is not a picture is refused with a clear message.
	await input.setInputFiles({
		name: "broken.png",
		mimeType: "image/png",
		buffer: Buffer.from("not an image"),
	});
	await expect(page.getByText("Could not open this wallpaper.", { exact: true })).toBeVisible();
	await expect(custom).toHaveCount(0);
	for (const scheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await input.setInputFiles(uploads.at(-1)!);
		await expect(custom).toHaveAttribute("aria-pressed", "true");
		await custom.hover();
		await page
			.locator("aside")
			.first()
			.screenshot({ path: `test-results/wallpaper-heic-uploaded-${scheme}.png` });
		await page.getByRole("button", { name: "Remove Custom wallpaper 1", exact: true }).click();
	}
});

test("uploaded wallpapers look the same in the preview and both export renderers", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await openEditor(page);
	const uploads = await makeUploads(page);
	const input = page.locator('input[type="file"]');
	const custom = page.getByRole("button", { name: "Custom wallpaper 1", exact: true });
	const stored: Record<string, string> = {};
	for (const upload of uploads) {
		await input.setInputFiles(upload);
		await expect(custom, upload.name).toHaveAttribute("aria-pressed", "true");
		stored[upload.name] = (await custom.locator("img").getAttribute("src")) ?? "";
		await custom.hover();
		await page.getByRole("button", { name: "Remove Custom wallpaper 1", exact: true }).click();
	}
	const modern: Record<string, string> = {};
	for (const [name, wallpaper] of Object.entries(stored)) {
		await page.goto(
			`/tests/ui/render-parity.html#${encodeURIComponent(JSON.stringify({ wallpaper }))}`,
		);
		await page.reload();
		await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
		const video = page.locator("[data-preview] video").first();
		await expect
			.poll(async () => {
				await page.evaluate(() => window.parity.seek(1.2));
				return video.evaluate((node: HTMLVideoElement) => node.currentTime);
			})
			.toBeCloseTo(1.2, 1);
		await page.evaluate(
			() =>
				new Promise((done) =>
					requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150))),
				),
		);
		const box = await page.locator("[data-preview]").boundingBox();
		if (!box) throw new Error("No preview");
		const width = Math.round(box.width);
		const shot = await page.screenshot({
			clip: { x: box.x, y: box.y, width, height: Math.round((width * 9) / 16) },
			animations: "disabled",
		});
		const frames = { preview: `data:image/png;base64,${shot.toString("base64")}` } as Record<
			string,
			string
		>;
		for (const kind of ["legacy", "modern"] as const) {
			frames[kind] = await page.evaluate(
				([renderer, size]) => window.parity.exportFrame(renderer, 1.2, size),
				[kind, width] as const,
			);
		}
		const report: Record<string, number> = {};
		for (const [a, b] of [
			["preview", "legacy"],
			["preview", "modern"],
			["legacy", "modern"],
		] as const) {
			report[`${a}-${b}`] = await changedFraction(page, frames[a], frames[b]);
			expect(report[`${a}-${b}`], `${name} ${a} vs ${b}`).toBeLessThan(0.002);
		}
		console.log(name, JSON.stringify(report));
		modern[name] = frames.modern;
	}
	// The comparison can tell pictures apart: a different wallpaper is a different frame.
	expect(await changedFraction(page, modern["photo.png"], modern["drawing.svg"])).toBeGreaterThan(
		0.05,
	);
});
