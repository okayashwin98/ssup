import { useSyncExternalStore } from "react";
import { loadAppSetting, saveAppSetting } from "./appSettings";

/** The app's theme colour; every accent shade is mixed from it. */
export const DEFAULT_ACCENT_COLOR = "#9754F4";
const STORAGE_KEY = "supershare.accentColor";
const CHANGE_EVENT = "supershare-accent-changed";
const HEX = /^#[0-9a-f]{6}$/i;
let cached: string | null = null;

export function normalizeAccentColor(value: unknown): string {
	return typeof value === "string" && HEX.test(value.trim())
		? value.trim().toUpperCase()
		: DEFAULT_ACCENT_COLOR;
}

export function loadAccentColor(): string {
	cached ??= normalizeAccentColor(loadAppSetting<string>(STORAGE_KEY));
	return cached;
}

function channels(hex: string) {
	return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

/** White text on dark colours, near-black on light ones (WCAG relative luminance). */
export function accentForeground(hex: string): string {
	const [r, g, b] = channels(hex).map((value) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance > 0.45 ? "#111111" : "#FFFFFF";
}

export function applyAccentColor(hex: string, root: HTMLElement = document.documentElement) {
	const color = normalizeAccentColor(hex);
	root.style.setProperty("--accent", color);
	root.style.setProperty("--accent-foreground", accentForeground(color));
	root.style.setProperty("--brand-accent-rgb", channels(color).join(", "));
}

export function saveAccentColor(hex: string) {
	const color = normalizeAccentColor(hex);
	saveAppSetting(STORAGE_KEY, color);
	cached = color;
	applyAccentColor(color);
	globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
	// Other app windows share this origin and repaint on the storage event.
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, color);
	} catch {
		// Storage is optional; this window is already updated.
	}
}

/** Applies the saved colour now and whenever another window changes it. */
export function installAccentColor() {
	applyAccentColor(loadAccentColor());
	globalThis.addEventListener?.("storage", (event) => {
		if (event.key !== STORAGE_KEY) return;
		cached = normalizeAccentColor(event.newValue);
		applyAccentColor(cached);
		globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
	});
}

function subscribe(listener: () => void) {
	globalThis.addEventListener?.(CHANGE_EVENT, listener);
	return () => globalThis.removeEventListener?.(CHANGE_EVENT, listener);
}

export function useAccentColor(): string {
	return useSyncExternalStore(subscribe, loadAccentColor, () => DEFAULT_ACCENT_COLOR);
}
