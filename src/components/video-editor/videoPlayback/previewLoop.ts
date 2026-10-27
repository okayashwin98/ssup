import { useSyncExternalStore } from "react";

// Whether the editor preview starts again from the beginning when it reaches the end.
const STORAGE_KEY = "supershare.previewLoop";
const listeners = new Set<() => void>();

function read(): boolean {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

let loop = read();

export function getPreviewLoop(): boolean {
	return loop;
}

export function setPreviewLoop(next: boolean) {
	loop = next;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, String(next));
	} catch {
		// Remembering it is a convenience.
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePreviewLoop(): boolean {
	return useSyncExternalStore(subscribe, getPreviewLoop, () => false);
}
