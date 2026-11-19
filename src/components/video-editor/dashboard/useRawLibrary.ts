import { useCallback, useEffect, useState } from "react";
import { loadLastingValue, saveLastingValue } from "@/lib/appSettings";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";

const HIDDEN_KEY = "recordly.raw-hidden.v1";
// Hidden and renamed Raw files are kept in app settings so they survive a restart.
function loadHidden(): string[] {
	const value = loadLastingValue(HIDDEN_KEY);
	return Array.isArray(value)
		? value.filter((path): path is string => typeof path === "string")
		: [];
}
const NAMES_KEY = "recordly.raw-names.v1";
function loadNames(): Record<string, string> {
	const value = loadLastingValue(NAMES_KEY);
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}
export function useRawLibrary(enabled: boolean) {
	const [entries, setEntries] = useState<ProjectLibraryEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const result = await window.electronAPI.listRecordings(true);
			if (!result.success) throw Error(result.error);
			const names = loadNames();
			const hidden = new Set(loadHidden());
			setEntries(
				result.value
					.filter((entry) => !hidden.has(entry.path))
					.map((rawSource) => ({
						path: rawSource.path,
						name: names[rawSource.path] || rawSource.name,
						createdAt: rawSource.createdAt,
						updatedAt: rawSource.createdAt,
						thumbnailPath: null,
						isCurrent: false,
						isInProjectsDirectory: false,
						bytes: rawSource.bytes,
						durationMs: rawSource.durationMs,
						recordedAt: rawSource.createdAt,
						rawSource,
					})),
			);
			setError(null);
		} catch (error) {
			setError(String(error));
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		if (enabled) void refresh();
	}, [enabled, refresh]);
	const rename = async (path: string, name: string) => {
		if (!saveLastingValue(NAMES_KEY, { ...loadNames(), [path]: name }))
			throw Error("Could not save the new name");
		setEntries((previous) =>
			previous.map((entry) => (entry.path === path ? { ...entry, name } : entry)),
		);
		return path;
	};
	const remove = async (paths: string[]) => {
		if (!saveLastingValue(HIDDEN_KEY, [...new Set([...loadHidden(), ...paths])]))
			throw Error("Could not save which recordings are removed");
		setEntries((previous) => previous.filter((entry) => !paths.includes(entry.path)));
		return paths;
	};
	return { entries, error, loading, refresh, rename, remove };
}
