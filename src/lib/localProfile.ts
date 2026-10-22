import { useSyncExternalStore } from "react";
import { loadAppSetting, saveAppSetting } from "./appSettings";

/** Name and photo used when no sign-in service is configured. */
export type LocalProfile = { name: string; avatarDataUrl: string | null };

const STORAGE_KEY = "recordly.localProfile";
const CHANGE_EVENT = "recordly-local-profile-changed";
const EMPTY_PROFILE: LocalProfile = { name: "", avatarDataUrl: null };
let cached: LocalProfile | null = null;

export function loadLocalProfile(): LocalProfile {
	if (cached) return cached;
	const stored = loadAppSetting<Partial<LocalProfile>>(STORAGE_KEY);
	cached = {
		name: typeof stored?.name === "string" ? stored.name : "",
		avatarDataUrl:
			typeof stored?.avatarDataUrl === "string" &&
			stored.avatarDataUrl.startsWith("data:image/")
				? stored.avatarDataUrl
				: null,
	};
	return cached;
}

export function saveLocalProfile(profile: LocalProfile): boolean {
	const next = { name: profile.name.trim().slice(0, 80), avatarDataUrl: profile.avatarDataUrl };
	if (!saveAppSetting(STORAGE_KEY, next)) return false;
	cached = next;
	globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
	return true;
}

function subscribe(listener: () => void) {
	globalThis.addEventListener?.(CHANGE_EVENT, listener);
	return () => globalThis.removeEventListener?.(CHANGE_EVENT, listener);
}

export function useLocalProfile(): LocalProfile {
	return useSyncExternalStore(subscribe, loadLocalProfile, () => EMPTY_PROFILE);
}

/** Centre-crop an image file to a 256 px square JPEG data URL. */
export async function createAvatarDataUrl(file: File, size = 256): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new Image();
			element.onload = () => resolve(element);
			element.onerror = () => reject(new Error("That file isn't an image the app can read."));
			element.src = url;
		});
		const side = Math.min(image.naturalWidth, image.naturalHeight);
		if (!side) throw new Error("That image is empty.");
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not prepare the photo.");
		context.drawImage(
			image,
			(image.naturalWidth - side) / 2,
			(image.naturalHeight - side) / 2,
			side,
			side,
			0,
			0,
			size,
			size,
		);
		return canvas.toDataURL("image/jpeg", 0.9);
	} finally {
		URL.revokeObjectURL(url);
	}
}
