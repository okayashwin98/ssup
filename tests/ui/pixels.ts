import type { Locator, Page } from "@playwright/test";

/** Fraction (0–1) of pixels whose colour differs noticeably between two images of the same size. */
export async function changedFraction(
	page: Page,
	first: string,
	second: string,
	region?: { x: number; y: number; width: number; height: number },
) {
	return page.evaluate(
		async ([a, b, box]) => {
			const load = async (url: string) => {
				const bitmap = await createImageBitmap(await (await fetch(url)).blob());
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const context = canvas.getContext("2d");
				if (!context) throw new Error("No 2D context");
				context.drawImage(bitmap, 0, 0);
				const x = box ? Math.round(box.x * bitmap.width) : 0;
				const y = box ? Math.round(box.y * bitmap.height) : 0;
				const width = box ? Math.round(box.width * bitmap.width) : bitmap.width;
				const height = box ? Math.round(box.height * bitmap.height) : bitmap.height;
				return context.getImageData(x, y, width, height);
			};
			const [left, right] = await Promise.all([load(a), load(b)]);
			if (left.width !== right.width || left.height !== right.height) {
				throw new Error(
					`Size mismatch ${left.width}x${left.height} vs ${right.width}x${right.height}`,
				);
			}
			let changed = 0;
			for (let index = 0; index < left.data.length; index += 4) {
				const delta =
					Math.abs(left.data[index] - right.data[index]) +
					Math.abs(left.data[index + 1] - right.data[index + 1]) +
					Math.abs(left.data[index + 2] - right.data[index + 2]);
				if (delta > 48) changed += 1;
			}
			return changed / (left.data.length / 4);
		},
		[first, second, region ?? null] as const,
	);
}

export async function screenshotDataUrl(target: Locator) {
	return `data:image/png;base64,${(await target.screenshot({ animations: "disabled" })).toString("base64")}`;
}
