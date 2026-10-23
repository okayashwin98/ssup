import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export type ShareCardInput = {
	title: string;
	/** JPEG poster frame of the shared video. */
	poster: Buffer;
	avatarDataUrl?: string | null;
	name?: string;
	/** Inter Display Medium, as woff2. */
	font: Buffer;
};

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
	);

/**
 * The link-preview image: the video frame fading in from the right, the owner's photo
 * top left and the title large at the bottom left.
 */
export function buildShareCardHtml(input: ShareCardInput) {
	const avatar =
		input.avatarDataUrl &&
		/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(input.avatarDataUrl)
			? `<img class="avatar" src="${input.avatarDataUrl}" alt="">`
			: input.name?.trim()
				? `<div class="avatar initial">${escapeHtml(input.name.trim().charAt(0).toUpperCase())}</div>`
				: "";
	return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
@font-face { font-family: "Inter Display"; font-weight: 500; src: url(data:font/woff2;base64,${input.font.toString("base64")}) format("woff2"); }
html, body { margin: 0; width: ${SHARE_CARD_WIDTH}px; height: ${SHARE_CARD_HEIGHT}px; overflow: hidden; background: #0c0c0d; }
.poster { position: absolute; top: 0; right: 0; bottom: 0; left: 200px; width: 1000px; height: 100%; object-fit: cover; }
.fade { position: absolute; inset: 0; background:
	linear-gradient(90deg, #0c0c0d 0%, #0c0c0d 24%, rgba(12,12,13,0.86) 40%, rgba(12,12,13,0.4) 62%, rgba(12,12,13,0) 84%),
	linear-gradient(0deg, rgba(12,12,13,0.55) 0%, rgba(12,12,13,0) 45%); }
.avatar { position: absolute; top: 56px; left: 56px; width: 96px; height: 96px; border-radius: 50%; object-fit: cover; }
.initial { display: flex; align-items: center; justify-content: center; background: #2a2a2e; color: #fff; font: 500 44px "Inter Display", sans-serif; }
.title { position: absolute; left: 56px; bottom: 52px; width: 580px; margin: 0; color: #fff;
	font-family: "Inter Display", sans-serif; font-weight: 500; font-size: 84px; line-height: 0.98; letter-spacing: 0;
	display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; overflow-wrap: anywhere; }
</style></head><body>
<img class="poster" src="data:image/jpeg;base64,${input.poster.toString("base64")}" alt="">
<div class="fade"></div>
${avatar}
<h1 class="title">${escapeHtml(input.title)}</h1>
<script>
document.fonts.ready.then(() => {
	const title = document.querySelector(".title");
	// Long titles step down in size before they would need more than four lines.
	for (const size of [84, 72, 62, 54]) {
		title.style.fontSize = size + "px";
		if (title.scrollHeight <= title.clientHeight + 1) break;
	}
	document.title = "ready";
});
</script>
</body></html>`;
}

/** Renders the link-preview image to a JPEG in a hidden window. */
export async function renderShareCard(input: ShareCardInput): Promise<Buffer> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-card-"));
	const file = path.join(dir, "card.html");
	const window = new BrowserWindow({
		show: false,
		width: SHARE_CARD_WIDTH,
		height: SHARE_CARD_HEIGHT,
		useContentSize: true,
		webPreferences: {
			offscreen: true,
			sandbox: true,
			javascript: true,
			nodeIntegration: false,
		},
	});
	try {
		await fs.writeFile(file, buildShareCardHtml(input));
		await window.loadFile(file);
		const deadline = Date.now() + 5000;
		while (window.webContents.getTitle() !== "ready" && Date.now() < deadline)
			await new Promise((resolve) => setTimeout(resolve, 50));
		// One more frame so the final title size is painted.
		await new Promise((resolve) => setTimeout(resolve, 100));
		const image = await window.webContents.capturePage({
			x: 0,
			y: 0,
			width: SHARE_CARD_WIDTH,
			height: SHARE_CARD_HEIGHT,
		});
		const size = image.getSize();
		if (!size.width || !size.height) throw new Error("Link preview came out empty");
		return image
			.resize({ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, quality: "best" })
			.toJPEG(88);
	} finally {
		window.destroy();
		await fs.rm(dir, { recursive: true, force: true });
	}
}
