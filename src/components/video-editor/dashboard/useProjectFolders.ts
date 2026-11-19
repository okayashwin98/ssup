import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { loadLastingValue, saveLastingValue } from "@/lib/appSettings";
export const FOLDER_COLORS = ["#929292", "#de85ac", "#d6ad58", "#70ad8a", "#759bd2", "#a68ccc"];
export type ProjectFolder = { id: string; name: string; color: string; paths: string[] };
const KEY = "recordly.project-folders.v1";
const CHANGED = "recordly-folders-changed";

/** The saved folders; kept in app settings so they survive a restart. */
export function loadProjectFolders(): ProjectFolder[] {
	const value = loadLastingValue(KEY);
	return Array.isArray(value)
		? value.filter(
				(f) =>
					f &&
					typeof f.id === "string" &&
					typeof f.name === "string" &&
					/^#[0-9a-f]{6}$/i.test(f.color) &&
					Array.isArray(f.paths) &&
					f.paths.every((p: unknown) => typeof p === "string"),
			)
		: [];
}

/** Saves folders and tells every open folder list; false when nothing could be stored. */
export function saveProjectFolders(next: ProjectFolder[]) {
	if (!saveLastingValue(KEY, next)) return false;
	window.dispatchEvent(new CustomEvent(CHANGED, { detail: next }));
	return true;
}

export function moveProjectFolderReferences(previous: string, next: string) {
	const folders = loadProjectFolders();
	if (!folders.some((folder) => folder.paths.includes(previous))) return;
	saveProjectFolders(
		folders.map((folder) => ({
			...folder,
			paths: folder.paths.map((path) => (path === previous ? next : path)),
		})),
	);
}

export function useProjectFolders() {
	const [folders, setFolders] = useState<ProjectFolder[]>(loadProjectFolders);
	useEffect(() => {
		const refresh = (event: Event) =>
			setFolders((event as CustomEvent<ProjectFolder[]>).detail);
		window.addEventListener(CHANGED, refresh);
		return () => window.removeEventListener(CHANGED, refresh);
	}, []);
	const save = (next: ProjectFolder[]) => {
		if (saveProjectFolders(next)) setFolders(next);
		else toast.error("Could not save folders");
	};
	return { folders, save };
}
