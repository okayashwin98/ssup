import { Card } from "@heroui/react";
import { CopyDetailsButton, ReportStatus, useSaveReport } from "@/components/feedback/CrashScreen";
import { Button } from "@/components/ui/button";
import {
	ArrowClockwise,
	DownloadSimple,
	FolderOpen,
	House,
	WarningCircleIcon,
} from "@/components/ui/icons";
import {
	describeProjectLoadError,
	fileNameOf,
	type ProjectLoadFailure,
	projectLoadDetails,
} from "../project/projectLoadError";

/** In place of the editor when a project can't open: the cause in plain words and ways out. */
export function ProjectLoadError({
	failure,
	onRetry,
	onHome,
	onLocate,
	busy = false,
}: {
	failure: ProjectLoadFailure;
	onRetry: () => void;
	onHome: () => void;
	onLocate?: () => void;
	busy?: boolean;
}) {
	const copy = describeProjectLoadError(failure);
	const details = projectLoadDetails(failure);
	const { state, save } = useSaveReport("project-load", { message: details });
	return (
		<main className="flex h-screen w-full items-center justify-center bg-editor-bg p-6 text-foreground">
			<Card
				role="alertdialog"
				aria-labelledby="project-error-title"
				aria-describedby="project-error-description"
				className="w-full max-w-lg gap-4 p-6"
			>
				<div className="flex flex-col gap-2">
					<WarningCircleIcon className="size-6 text-muted-foreground" />
					<h1 id="project-error-title" className="text-base font-semibold">
						{copy.title}
					</h1>
					{failure.projectPath && (
						<p className="select-text break-words text-sm font-medium">
							{fileNameOf(failure.projectPath)}
						</p>
					)}
					{failure.recordingPath && (
						<p className="select-text break-words text-xs text-muted-foreground">
							Recording: {failure.recordingPath}
						</p>
					)}
					<p
						id="project-error-description"
						className="text-sm leading-relaxed text-muted-foreground"
					>
						{copy.description}
					</p>
				</div>
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer select-none">Technical details</summary>
					<pre className="custom-scrollbar mt-2 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
						{details}
					</pre>
				</details>
				<div className="-mx-2 -mt-2 flex flex-wrap items-center gap-1">
					<CopyDetailsButton text={details} size="sm" />
					<Button
						variant="ghost"
						size="sm"
						disabled={state.kind === "saving"}
						onClick={() => void save()}
					>
						<DownloadSimple />
						{state.kind === "saving" ? "Saving…" : "Save report"}
					</Button>
				</div>
				<ReportStatus state={state} />
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button variant="ghost" onClick={onHome}>
						<House />
						Back to Home
					</Button>
					{copy.canLocate && onLocate && (
						<Button variant="secondary" disabled={busy} onClick={onLocate}>
							<FolderOpen />
							Locate recording
						</Button>
					)}
					<Button disabled={busy} onClick={onRetry}>
						<ArrowClockwise />
						{busy ? "Opening…" : "Try again"}
					</Button>
				</div>
			</Card>
		</main>
	);
}
