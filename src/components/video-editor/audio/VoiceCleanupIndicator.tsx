import { Tooltip } from "@heroui/react";
import { WarningCircleIcon } from "@/components/ui/icons";
import type { VoiceCleanupStatus } from "./useNoiseFilterAudio";

/** The share done as a pie slice drawn from twelve o'clock, like AirDrop's preparing pie. */
function slicePath(fraction: number) {
	const r = 4.5;
	const angle = Math.min(0.9999, fraction) * 2 * Math.PI;
	const x = 7 + r * Math.sin(angle);
	const y = 7 - r * Math.cos(angle);
	return `M7 7 L7 ${7 - r} A${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x} ${y} Z`;
}

/**
 * A small pie beside a voice setting while its cleaned voice is being made; hover says which
 * step it is on. A failure shows a warning that tries again when clicked. It takes no room
 * of its own, so nothing around it moves when it comes and goes.
 */
export function VoiceCleanupIndicator({
	status,
	onRetry,
}: {
	status: VoiceCleanupStatus | null | undefined;
	onRetry?: () => void;
}) {
	if (!status) return null;
	if (status.state === "error")
		return (
			<Tooltip delay={0}>
				<Tooltip.Trigger
					role="button"
					aria-label="Cleaning failed. Try again"
					className="inline-flex size-3.5 cursor-pointer items-center justify-center text-danger"
					onClick={onRetry}
				>
					<WarningCircleIcon className="size-3.5" />
				</Tooltip.Trigger>
				<Tooltip.Content>
					Couldn't prepare the cleaned voice. Click to try again.
				</Tooltip.Content>
			</Tooltip>
		);
	const percent = Math.round(status.fraction * 100);
	return (
		<Tooltip delay={0}>
			<Tooltip.Trigger
				aria-label={`${status.stage}, ${percent}%`}
				className="inline-flex size-3.5 items-center justify-center text-accent"
			>
				<svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
					<circle
						cx="7"
						cy="7"
						r="6"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.25"
					/>
					{status.fraction > 0 && (
						<path d={slicePath(status.fraction)} fill="currentColor" />
					)}
				</svg>
			</Tooltip.Trigger>
			<Tooltip.Content>
				{status.stage}… {percent}%
			</Tooltip.Content>
		</Tooltip>
	);
}
