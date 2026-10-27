import { Card } from "@heroui/react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/contexts/I18nContext";

// Set when the app has put Liquid Glass under the card (macOS 26+).
const onGlass = new URLSearchParams(window.location.search).get("glass") === "1";

export function CountdownOverlay() {
	const { t } = useI18n();
	const [countdown, setCountdown] = useState<number | null>(null);

	useEffect(() => {
		void window.electronAPI.getActiveCountdown().then((result) => {
			if (result.success && typeof result.seconds === "number") {
				setCountdown(result.seconds);
			}
		});

		const cleanup = window.electronAPI.onCountdownTick((seconds: number) => {
			setCountdown(seconds);
		});

		return cleanup;
	}, []);

	const handleCancel = useCallback(() => {
		window.electronAPI.cancelCountdown();
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape") {
				handleCancel();
			}
		},
		[handleCancel],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	if (countdown === null) {
		return null;
	}

	return (
		<div className="fixed inset-0 flex items-center justify-center" onClick={handleCancel}>
			<Card
				// 176 × 176 with a 40 pt corner: the glass the app draws under it is that shape.
				className={
					onGlass
						? "size-44 items-center justify-center gap-1 rounded-[40px] bg-transparent text-white shadow-none"
						: "size-44 items-center justify-center gap-1"
				}
				aria-live="assertive"
			>
				<span className="text-7xl tabular-nums">{countdown}</span>
				<Button
					variant="ghost"
					size="sm"
					className={onGlass ? "text-white hover:bg-white/15" : undefined}
					onClick={(event) => {
						event.stopPropagation();
						handleCancel();
					}}
				>
					{t("common.actions.cancel", "Cancel")}
				</Button>
			</Card>
		</div>
	);
}
