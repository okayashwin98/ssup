import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { loadLastingValue, saveLastingValue } from "@/lib/appSettings";

type Metadata = { colors: string[] };
const KEY = "recordly.dashboard-metadata.v1";
function load(): Metadata {
	try {
		const value = (loadLastingValue(KEY) ?? {}) as { colors?: unknown };
		return {
			colors: Array.isArray(value.colors)
				? value.colors.filter(
						(c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c),
					)
				: [],
		};
	} catch {
		return { colors: [] };
	}
}
export function useDashboardMetadata() {
	const [metadata, setMetadata] = useState(load);
	const update = (next: Metadata) => {
		if (saveLastingValue(KEY, next)) setMetadata(next);
		else toast.error("Could not save library preferences");
	};
	return { metadata, update };
}
