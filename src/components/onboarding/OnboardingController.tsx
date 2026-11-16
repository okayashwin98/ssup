import { Modal } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import { OnboardingIntro } from "./OnboardingIntro";
import { OnboardingPermissions } from "./OnboardingPermissions";

const SEEN_KEY = "recordly.onboarding.v1.seen";
/** The icon-and-wordmark intro plays once per install, before the first welcome. */
const INTRO_SEEN_KEY = "supershare.onboarding.introSeen";

/**
 * The permissions welcome: shown on first launch, on request, and when recording needs access.
 * On first launch (and from Settings → Show onboarding) the intro plays over it first.
 */
export function OnboardingController({
	requestNonce,
	introRequestNonce = 0,
	ready,
}: {
	requestNonce: number;
	introRequestNonce?: number;
	ready: boolean;
}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const [intro, setIntro] = useState(false);
	const checked = useRef(false);
	useEffect(() => {
		if (requestNonce > 0) setOpen(true);
	}, [requestNonce]);
	const playIntro = useCallback(() => {
		saveAppSetting(INTRO_SEEN_KEY, true);
		setIntro(true);
	}, []);
	useEffect(() => {
		if (introRequestNonce > 0) {
			setOpen(true);
			playIntro();
		}
	}, [introRequestNonce, playIntro]);
	const close = useCallback(() => {
		saveAppSetting("recordly.onboarding.permissionsRequested", false);
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!ready || checked.current) return;
		checked.current = true;
		const firstLaunch = !loadAppSetting<boolean>(SEEN_KEY);
		if (loadAppSetting<boolean>("recordly.onboarding.permissionsRequested") || firstLaunch)
			setOpen(true);
		// The welcome opens underneath straight away, so the permission check is not delayed.
		if (firstLaunch && !loadAppSetting<boolean>(INTRO_SEEN_KEY)) playIntro();
	}, [ready, playIntro]);

	useEffect(() => window.electronAPI.onRecordingPermissionsRequested?.(() => setOpen(true)), []);

	const finish = () => {
		saveAppSetting(SEEN_KEY, true);
		close();
		void window.electronAPI.showRecordingHud();
	};

	return (
		<>
			{intro && <OnboardingIntro onDone={() => setIntro(false)} />}
			<Modal
				isOpen={open}
				onOpenChange={(value) => {
					if (!value) close();
				}}
			>
				<Modal.Backdrop isDismissable={!intro}>
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
		</>
	);
}
