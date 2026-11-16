import { Modal } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import { OnboardingPermissions } from "./OnboardingPermissions";

const SEEN_KEY = "recordly.onboarding.v1.seen";

/** The permissions welcome: shown on first launch, on request, and when recording needs access. */
export function OnboardingController({
	requestNonce,
	ready,
}: {
	requestNonce: number;
	ready: boolean;
}) {
	const { t } = useI18n();
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
		if (!ready || checked.current) return;
		checked.current = true;
		if (
			loadAppSetting<boolean>("recordly.onboarding.permissionsRequested") ||
			!loadAppSetting<boolean>(SEEN_KEY)
		)
			setOpen(true);
	}, [ready]);

	useEffect(() => window.electronAPI.onRecordingPermissionsRequested?.(() => setOpen(true)), []);

	const finish = () => {
		saveAppSetting(SEEN_KEY, true);
		close();
		void window.electronAPI.showRecordingHud();
	};

	return (
		<Modal
			isOpen={open}
			onOpenChange={(value) => {
				if (!value) close();
			}}
		>
			<Modal.Backdrop isDismissable>
				<Modal.Container size="cover" placement="center" className="p-4">
					<Modal.Dialog
						aria-label="Welcome to SuperShare"
						data-onboarding-state="permissions"
						className="h-auto max-h-[calc(100dvh-32px)] min-h-0 w-full max-w-[600px] gap-0 overflow-hidden p-0"
					>
						<div className="flex h-full min-h-0 flex-col">
							<div className="flex h-full min-h-0 flex-col">
								<OnboardingPermissions onFinish={finish} />
							</div>
						</div>
						<Modal.CloseTrigger
							aria-label={t("common.actions.close")}
							className="z-20"
						/>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
