import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "@/components/video-editor/SettingsRow";

/** Open at login, read from the system on open and on return so it matches System Settings. */
export function OpenAtLoginSetting() {
	const [state, setState] = useState<OpenAtLoginState>();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();

	const read = useCallback(async () => {
		try {
			const next = await window.electronAPI.getOpenAtLogin();
			setState(next);
			if (!next.success) setError("Couldn’t read this setting.");
		} catch {
			setError("Couldn’t read this setting.");
		}
	}, []);

	useEffect(() => {
		void read();
		const onFocus = () => void read();
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [read]);

	if (!state?.supported) return null;

	const change = async (enabled: boolean) => {
		setSaving(true);
		try {
			const next = await window.electronAPI.setOpenAtLogin(enabled);
			setState(next);
			setError(next.success ? undefined : "Couldn’t change this setting. Try again.");
		} catch {
			setError("Couldn’t change this setting. Try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<SettingsRow
			title="Open at login"
			description={
				error ??
				(state.available
					? "Start SuperShare when you sign in."
					: "Works in the installed app, not in development mode.")
			}
		>
			<Switch
				aria-label="Open at login"
				checked={state.openAtLogin}
				disabled={!state.available || saving}
				onCheckedChange={(enabled) => void change(enabled)}
			/>
		</SettingsRow>
	);
}
