import { createRoot } from "react-dom/client";
import { LocalProfileSettings } from "@/components/auth/LocalProfileSettings";
import "@/index.css";

// Local fixture: settings live in memory; nothing is published.
const settings = new Map<string, unknown>();
Object.assign(window, {
	electronAPI: {
		getAppSetting: (key: string) => settings.get(key) ?? null,
		setAppSetting: (key: string, value: unknown) => {
			settings.set(key, value);
			return true;
		},
	},
});

createRoot(document.getElementById("root") as HTMLElement).render(<LocalProfileSettings />);
