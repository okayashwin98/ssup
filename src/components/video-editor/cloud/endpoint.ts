export const CLOUD_SHARE_ENDPOINT =
	import.meta.env.VITE_CLOUD_SHARE_ENDPOINT?.trim() ||
	(import.meta.env.DEV ? "http://localhost:8787/api/upload" : "");

// The personal share Worker accepts its API_SECRET as the upload token.
export const CLOUD_SHARE_PERSONAL_TOKEN =
	import.meta.env.VITE_CLOUD_SHARE_SECRET?.trim() || undefined;
