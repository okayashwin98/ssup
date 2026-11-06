import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export type ShareCardInput = {
	/** JPEG poster frame of the shared video. */
	poster: Buffer;
};

/** Phosphor's filled play icon, as on the share page's cover. */
const PLAY_PATH =
	"M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z";

/**
 * The link-preview image: the whole video frame with the share page's play button in the
 * middle. Where the frame's shape differs from the card's, a blurred copy fills the rest.
 */
export function buildShareCardHtml(input: ShareCardInput) {
	const poster = `data:image/jpeg;base64,${input.poster.toString("base64")}`;
	return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html, body { margin: 0; width: ${SHARE_CARD_WIDTH}px; height: ${SHARE_CARD_HEIGHT}px; overflow: hidden; background: #0c0c0d; }
.backdrop, .poster { position: absolute; inset: 0; width: 100%; height: 100%; }
.backdrop { object-fit: cover; filter: blur(40px) brightness(0.55); transform: scale(1.15); }
.poster { object-fit: contain; }
.play { position: absolute; left: 50%; top: 50%; width: 104px; height: 104px; display: grid; place-items: center;
	border-radius: 50%; transform: translate(-50%, -50%); background: rgba(40, 40, 40, 0.62); backdrop-filter: blur(6px); }
.play svg { width: 42%; height: 42%; }
</style></head><body>
<img class="backdrop" src="${poster}" alt="">
<img class="poster" src="${poster}" alt="">
<div class="play"><svg viewBox="0 0 256 256" fill="#fff"><path d="${PLAY_PATH}"/></svg></div>
<script>
document.querySelector(".poster").decode().catch(() => {}).then(() => { document.title = "ready"; });
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
		// One more frame so the decoded frame is painted.
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
