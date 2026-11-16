import { Button } from "@/components/ui/button";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function RecordNewButton({
	busy,
	run,
	className,
	first = false,
}: {
	busy: boolean;
	run: (action: () => Promise<void>) => Promise<void>;
	className?: string;
	first?: boolean;
}) {
	return (
		<Button
			// The empty-library prompt is neutral, matching the toolbar's Import button.
			variant={first ? "secondary" : "accent"}
			disabled={busy}
			onClick={() => void run(() => window.electronAPI.showRecordingHud())}
			className={cn("shrink-0 gap-2 text-[13px]", className)}
		>
			<Plus className="size-4" />
			{first ? "Capture your first video" : "Capture"}
		</Button>
	);
}
