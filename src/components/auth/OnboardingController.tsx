import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import { RecordlySignInDialog } from "./RecordlySignInDialog";

const SEEN_KEY = "recordly.onboarding.v1.seen";

export function OnboardingController({
	requestNonce,
	ready,
	user,
	configured,
	callbackError,
}: {
	requestNonce: number;
	ready: boolean;
	user: User | null;
	configured: boolean;
	callbackError?: string;
}) {
	const [open, setOpen] = useState(false);
	const checked = useRef(false);
	useEffect(() => {
		if (requestNonce > 0) setOpen(true);
	}, [requestNonce]);
	const close = useCallback(() => {
		saveAppSetting("recordly.onboarding.permissionsRequested", false);
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!ready) return;
		if (!user && configured) {
			setOpen(true);
			return;
		}
		if (checked.current) return;
		checked.current = true;
		if (
			loadAppSetting<boolean>("recordly.onboarding.permissionsRequested") ||
			!loadAppSetting<boolean>(SEEN_KEY)
		)
			setOpen(true);
	}, [ready, user, configured]);

	useEffect(() => window.electronAPI.onRecordingPermissionsRequested?.(() => setOpen(true)), []);

	const finish = () => {
		if (!user && configured) return;
		saveAppSetting(SEEN_KEY, true);
		close();
		void window.electronAPI.showRecordingHud();
	};

	return (
		<RecordlySignInDialog
			onboarding
			variant="wide"
			open={open}
			onOpenChange={(value) => {
				if (!value && (user || !configured)) close();
			}}
			user={user}
			configured={configured}
			callbackError={callbackError}
			onAuthenticated={finish}
		/>
	);
}
