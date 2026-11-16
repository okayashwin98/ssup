import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Cursor, MonitorIcon } from "@/components/ui/icons";
import { OnboardingBody, OnboardingFooter, OnboardingHeader } from "./OnboardingLayout";
import { PermissionsConfetti } from "./PermissionsConfetti";

export function OnboardingPermissions({ onFinish }: { onFinish: () => void }) {
	const [platform, setPlatform] = useState<"checking" | "mac" | "other">("checking");
	const [screenGranted, setScreenGranted] = useState(false);
	const [accessibilityGranted, setAccessibilityGranted] = useState(false);
	const [busy, setBusy] = useState<string>();
	const [error, setError] = useState<string>();
	const refresh = useCallback(async () => {
		const [screen, accessibility] = await Promise.all([
			window.electronAPI.getScreenRecordingPermissionStatus(),
			window.electronAPI.getAccessibilityPermissionStatus(),
		]);
		if (!screen.success || !accessibility.success)
			throw new Error("Could not check permissions. Try again.");
		setScreenGranted(screen.status === "granted");
		setAccessibilityGranted(accessibility.trusted);
		setError(undefined);
		return screen.status === "granted" && accessibility.trusted;
	}, []);

	useEffect(() => {
		let disposed = false;
		void (async () => {
			try {
				const mac = (await window.electronAPI.getPlatform()) === "darwin";
				if (mac) await refresh();
				if (!disposed) setPlatform(mac ? "mac" : "other");
			} catch (error) {
				if (!disposed) {
					setError(String(error));
					setPlatform("mac");
				}
			}
		})();
		return () => {
			disposed = true;
		};
	}, [refresh]);

	useEffect(() => {
		if (platform !== "mac") return;
		const check = () => {
			void refresh().catch((error) => setError(String(error)));
		};
		const visible = () => {
			if (document.visibilityState === "visible") check();
		};
		window.addEventListener("focus", check);
		document.addEventListener("visibilitychange", visible);
		return () => {
			window.removeEventListener("focus", check);
			document.removeEventListener("visibilitychange", visible);
		};
	}, [platform, refresh]);
	const allow = async (permission: "screen" | "accessibility") => {
		if (busy) return;
		setBusy(permission);
		try {
			if (permission === "accessibility") {
				const result = await window.electronAPI.requestAccessibilityPermission();
				if (!result.success)
					throw new Error(result.error || "Could not request Accessibility access.");
				if (!result.trusted) {
					const opened = await window.electronAPI.openAccessibilityPreferences();
					if (!opened.success)
						throw new Error(opened.error || "Could not open System Settings.");
				}
			} else {
				const result = await window.electronAPI.openScreenRecordingPreferences();
				if (!result.success)
					throw new Error(result.error || "Could not open System Settings.");
			}
			await refresh();
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(undefined);
		}
	};

	const allGranted = screenGranted && accessibilityGranted;
	const checkAgain = () => void refresh().catch((error) => setError(String(error)));

	return (
		<div className="onboarding-permissions relative flex min-h-0 flex-col">
			<PermissionsConfetti ready={platform === "mac" && allGranted && !error} />
			<OnboardingBody scrollable={false}>
				{platform === "checking" ? (
					<p role="status" className="py-12 text-center text-sm text-muted">
						Checking permissions…
					</p>
				) : (
					<>
						<OnboardingHeader
							title="Allow SuperShare to record"
							description={
								platform === "mac"
									? "Turn on these two permissions in macOS System Settings."
									: "Your screen is captured only when you start a recording. Microphone and camera access are requested when you use them."
							}
						/>
						{platform === "mac" && (
							<>
								<div className="divide-y divide-separator border-y border-separator">
									{[
										{
											key: "screen" as const,
											name: "Screen Recording",
											description:
												"Capture a screen, window or selected area.",
											granted: screenGranted,
											icon: MonitorIcon,
										},
										{
											key: "accessibility" as const,
											name: "Accessibility",
											description: "Track your cursor and highlight clicks.",
											granted: accessibilityGranted,
											icon: Cursor,
										},
									].map(({ key, name, description, granted, icon: Icon }) => (
										<div key={key} className="flex items-center gap-3 py-3">
											<Icon
												size={20}
												aria-hidden="true"
												className="shrink-0 text-muted"
											/>
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<h3 className="text-[13px] font-medium">{name}</h3>
												<p className="text-xs leading-relaxed text-muted">
													{description}
												</p>
											</div>
											{granted ? (
												<span className="flex h-8 shrink-0 items-center gap-1.5 text-xs font-medium text-success">
													<Check size={14} aria-hidden="true" />
													Allowed
												</span>
											) : (
												<Button
													variant="secondary"
													className="shrink-0"
													isDisabled={Boolean(busy)}
													onPress={() => void allow(key)}
													aria-label={`Allow ${name}`}
												>
													{busy === key ? "Opening…" : "Allow"}
												</Button>
											)}
										</div>
									))}
								</div>
								{error && (
									<p role="alert" className="text-xs text-danger">
										{error}
									</p>
								)}
							</>
						)}
					</>
				)}
			</OnboardingBody>
			<OnboardingFooter>
				<p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
					{platform === "mac" &&
						(allGranted ? (
							"Your screen is captured only when you start recording. Microphone and camera access are requested when you use them."
						) : (
							<>
								Allow both, then come back here. macOS may ask you to restart
								SuperShare.{" "}
								<Button
									variant="link"
									className="inline text-xs font-medium text-foreground"
									isDisabled={Boolean(busy)}
									onPress={checkAgain}
								>
									Check again
								</Button>
								{" · "}
								{/* SuperShare's icon beside System Settings, to drag into the list. */}
								<Button
									variant="link"
									className="inline text-xs font-medium text-foreground"
									isDisabled={Boolean(busy)}
									onPress={() =>
										void window.electronAPI.showPermissionDragHelper(
											screenGranted ? "accessibility" : "screen",
										)
									}
								>
									Not in the list?
								</Button>
							</>
						))}
				</p>
				<Button
					variant="accent"
					className="shrink-0"
					isDisabled={
						platform === "checking" ||
						(platform === "mac" && (!allGranted || Boolean(busy)))
					}
					onPress={onFinish}
				>
					Start recording <ArrowRight />
				</Button>
			</OnboardingFooter>
		</div>
	);
}
