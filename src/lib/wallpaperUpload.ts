const IMAGE_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	jfif: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	avif: "image/avif",
	gif: "image/gif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	heic: "image/heic",
	heif: "image/heif",
};

export const WALLPAPER_IMAGE_ACCEPT = [
	...new Set(Object.values(IMAGE_TYPES)),
	...Object.keys(IMAGE_TYPES).map((extension) => `.${extension}`),
].join(",");

/** Longest side kept for photos; larger images are scaled down to keep projects light. */
export const MAX_WALLPAPER_EDGE = 8192;
/** Vector images have no fixed size, so they are drawn at 4K. */
export const VECTOR_WALLPAPER_EDGE = 3840;

type WallpaperKind = "jpeg" | "heic" | "svg" | "raster";

function extensionOf(name: string) {
	return name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";
}

/** The image type, from the file's own type or, when that is missing or generic (many HEICs), its name. */
export function wallpaperMimeType(file: Pick<File, "name" | "type">): string {
	const type = file.type.toLowerCase();
	return type.startsWith("image/") ? type : (IMAGE_TYPES[extensionOf(file.name)] ?? "");
}

/** What an upload is: a JPEG kept as is, a HEIC to convert, a vector, or another picture. */
export function wallpaperUploadKind(file: Pick<File, "name" | "type">): WallpaperKind | null {
	const mime = wallpaperMimeType(file);
	if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
	if (/^image\/hei[cf](?:-sequence)?$/.test(mime)) return "heic";
	if (mime === "image/svg+xml") return "svg";
	if (Object.values(IMAGE_TYPES).includes(mime)) return "raster";
	return null;
}

/** Size to draw an image at: its own size, capped; vectors get a fixed 4K long side. */
export function wallpaperRasterSize(
	width: number,
	height: number,
	vector: boolean,
): { width: number; height: number } {
	if (!(width > 0 && height > 0)) {
		if (!vector) throw new Error("Image has no size");
		return {
			width: VECTOR_WALLPAPER_EDGE,
			height: Math.round((VECTOR_WALLPAPER_EDGE * 9) / 16),
		};
	}
	const longest = Math.max(width, height);
	const target = vector ? VECTOR_WALLPAPER_EDGE : Math.min(longest, MAX_WALLPAPER_EDGE);
	const scale = target / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function readDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === "string"
				? resolve(reader.result)
				: reject(new Error("Unreadable image"));
		reader.onerror = () => reject(new Error("Unreadable image"));
		reader.readAsDataURL(blob);
	});
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return image;
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Colour behind see-through parts of an uploaded picture, so every path shows the same thing. */
export const WALLPAPER_MATTE = "#000000";

/**
 * Draws the image once (first frame for GIFs) onto a solid matte and stores it as a JPEG,
 * so the preview and every export path read the very same, compact picture.
 */
async function rasterize(blob: Blob, vector: boolean): Promise<string> {
	const image = await loadImage(blob);
	const size = wallpaperRasterSize(image.naturalWidth, image.naturalHeight, vector);
	const canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas");
	ctx.fillStyle = WALLPAPER_MATTE;
	ctx.fillRect(0, 0, size.width, size.height);
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(image, 0, 0, size.width, size.height);
	return canvas.toDataURL("image/jpeg", 0.92);
}

/** Turns an uploaded image into the data URL stored as the wallpaper. Throws if it can't be read. */
export async function prepareWallpaperImage(
	file: File,
	convertHeic: Window["electronAPI"]["convertHeicWallpaper"] = typeof window === "undefined"
		? undefined
		: window.electronAPI?.convertHeicWallpaper,
): Promise<string> {
	const kind = wallpaperUploadKind(file);
	if (!kind) throw new Error("Unsupported wallpaper");
	if (kind === "jpeg") {
		// JPEGs are stored exactly as uploaded, as they always have been.
		const dataUrl = await readDataUrl(
			/^image\/jpe?g$/.test(file.type) ? file : new Blob([file], { type: "image/jpeg" }),
		);
		await loadImage(file);
		return dataUrl;
	}
	if (kind === "heic") {
		if (!convertHeic) throw new Error("HEIC conversion unavailable");
		const result = await convertHeic(new Uint8Array(await file.arrayBuffer()));
		if (!result.success || !result.data) throw new Error("HEIC conversion failed");
		return rasterize(new Blob([new Uint8Array(result.data)], { type: "image/png" }), false);
	}
	return rasterize(new Blob([file], { type: wallpaperMimeType(file) }), kind === "svg");
}
