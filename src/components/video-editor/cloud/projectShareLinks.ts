import { loadLastingValue, saveLastingValue } from "@/lib/appSettings";

const KEY = "recordly.project-share-links.v1";
// Read once: every project card asks on each render, and app settings are read from disk.
let cached: Record<string, string> | null = null;
// Another window's change arrives through its browser-storage mirror; read afresh next time.
globalThis.addEventListener?.("storage", (event) => {
	if ((event as StorageEvent).key === KEY) cached = null;
});

function readLinks(): Readonly<Record<string, string>> {
	cached ??= parseLinks(loadLastingValue(KEY));
	return cached;
}
function parseLinks(stored: unknown): Record<string, string> {
	if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
	return Object.fromEntries(
		Object.entries(stored).filter(
			(entry): entry is [string, string] =>
				typeof entry[1] === "string" && /^https?:\/\//.test(entry[1]),
		),
	);
}
function writeLinks(links: Record<string, string>) {
	cached = links;
	if (!saveLastingValue(KEY, links)) console.warn("Could not save project share links");
}
export function getProjectShareLink(path: string): string | undefined {
	return readLinks()[path];
}
export function saveProjectShareLink(path: string, url: string) {
	writeLinks({ ...readLinks(), [path]: url });
}
export function moveProjectShareLink(previous: string, next: string) {
	if (previous === next) return;
	const links = { ...readLinks() };
	if (!links[previous]) return;
	links[next] = links[previous];
	delete links[previous];
	writeLinks(links);
}
export function removeProjectShareLinks(paths: string[]) {
	const links = { ...readLinks() };
	for (const path of paths) delete links[path];
	writeLinks(links);
}
