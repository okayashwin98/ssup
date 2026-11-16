import { Card } from "@heroui/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ArrowClockwise,
	Check,
	Copy,
	DownloadSimple,
	WarningCircleIcon,
	XIcon,
} from "@/components/ui/icons";
import { copyText } from "@/lib/copyText";
import {
	errorDetailsText,
	type ReportableError,
	saveErrorReport,
} from "@/lib/feedback/errorReport";
import barStyles from "../launch/HudBar.module.css";
import { useBarWindowSize } from "../launch/hooks/useBarWindowSize";
import { useWindowGlass } from "../launch/hooks/useWindowGlass";

type SaveState =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "saved"; path: string; askedWhere: boolean }
	| { kind: "failed"; message: string };

/** Saves a report once at a time and remembers where it went. */
export function useSaveReport(
	reason: "crash" | "project-load" | "menu",
	error: ReportableError | undefined,
) {
	const [state, setState] = useState<SaveState>({ kind: "idle" });
	const busy = useRef(false);
	const save = async () => {
		if (busy.current) return null;
		busy.current = true;
		setState({ kind: "saving" });
		try {
			const result = await saveErrorReport(reason, error);
			if (result.success) {
				setState({ kind: "saved", path: result.path, askedWhere: result.askedWhere });
				return result.path;
			}
			setState({ kind: "idle" });
			return null;
		} catch (cause) {
			setState({
				kind: "failed",
				message: cause instanceof Error ? cause.message : String(cause),
			});
			return null;
		} finally {
			busy.current = false;
		}
	};
	return { state, save };
}

function fileName(filePath: string) {
	return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** "Saved to Documents as …" with Show in Finder, or why it couldn't save. */
export function ReportStatus({ state }: { state: SaveState }) {
	if (state.kind === "saved")
		return (
			<div role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
				<Check className="mt-0.5 size-4 shrink-0 text-success" />
				<p className="min-w-0">
					{state.askedWhere ? "Saved as" : "Saved to Documents as"}{" "}
					<span className="break-words font-medium text-foreground">
						{fileName(state.path)}
					</span>
					.{" "}
					<Button
						variant="link"
						className="text-sm"
						onClick={() => void window.electronAPI?.revealInFolder?.(state.path)}
					>
						Show in Finder
					</Button>
				</p>
			</div>
		);
	if (state.kind === "failed")
		return (
			<p role="alert" className="text-sm text-danger">
				Couldn’t save the report: {state.message}
			</p>
		);
	return null;
}

/** Copy details, with a brief tick once copied. */
export function CopyDetailsButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="ghost"
			onClick={() =>
				void copyText(text).then(
					() => {
						setCopied(true);
						window.setTimeout(() => setCopied(false), 1600);
					},
					() => setCopied(false),
				)
			}
		>
			{copied ? <Check /> : <Copy />}
			{copied ? "Copied" : "Copy details"}
		</Button>
	);
}

/** The crash screen for the editor, Home and the larger panels. */
export function CrashScreen({
	error,
	windowType,
	onRetry,
	panel = false,
}: {
	error: ReportableError;
	windowType: string;
	onRetry: () => void;
	panel?: boolean;
}) {
	const { state, save } = useSaveReport("crash", error);
	const details = errorDetailsText(error, windowType);
	return (
		<main
			className={`flex min-h-screen w-full items-center justify-center p-6 text-foreground ${panel ? "bg-transparent" : "bg-editor-bg"}`}
		>
			<Card
				role="alertdialog"
				aria-labelledby="crash-title"
				aria-describedby="crash-description"
				className="w-full max-w-md gap-4 p-6"
			>
				<div className="flex flex-col gap-2">
					<WarningCircleIcon className="size-6 text-muted-foreground" />
					<h1 id="crash-title" className="text-base font-semibold">
						Something went wrong
					</h1>
					<p
						id="crash-description"
						className="text-sm leading-relaxed text-muted-foreground"
					>
						This part of SuperShare stopped working. Try again to reload it. If it keeps
						happening, save a report and share it.
					</p>
				</div>
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer select-none">Technical details</summary>
					<pre className="custom-scrollbar mt-2 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
						{details}
					</pre>
				</details>
				<ReportStatus state={state} />
				<div className="flex flex-wrap items-center justify-end gap-2">
					<CopyDetailsButton text={details} />
					<Button
						variant="ghost"
						disabled={state.kind === "saving"}
						onClick={() => void save()}
					>
						<DownloadSimple />
						{state.kind === "saving" ? "Saving…" : "Save report"}
					</Button>
					{panel && (
						<Button variant="ghost" onClick={() => window.close()}>
							<XIcon />
							Close
						</Button>
					)}
					<Button onClick={onRetry}>
						<ArrowClockwise />
						Try again
					</Button>
				</div>
			</Card>
		</main>
	);
}

/**
 * The start bar, recording bar and camera bubble are only as big as their controls, so
 * their crash screen is a small bar of its own. The recording bar keeps a Stop button.
 */
export function BarCrashScreen({
	error,
	windowType,
	onRetry,
	bubble = false,
}: {
	error: ReportableError;
	windowType: string;
	onRetry: () => void;
	bubble?: boolean;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const onGlass = useWindowGlass();
	// The camera bubble's window keeps its own size; the bars fit their content.
	useBarWindowSize(bubble ? { current: null } : rootRef);
	const { state, save } = useSaveReport("crash", error);
	const saveAndShow = async () => {
		const saved = await save();
		// The bar has no room for a confirmation, so Finder shows the saved file.
		if (saved) void window.electronAPI?.revealInFolder?.(saved);
	};
	const item = `${barStyles.item} ${barStyles.iconOnly}`;
	const buttons = (
		<>
			{windowType === "recording-controls" && (
				<button
					type="button"
					className={barStyles.stop}
					data-own-hover=""
					onClick={() => window.electronAPI?.sendRecordingControlsCommand?.("stop")}
					title="Stop recording"
					aria-label="Stop recording"
				>
					<span className={barStyles.stopSquare} />
				</button>
			)}
			<button
				type="button"
				className={item}
				onClick={onRetry}
				title="Try again"
				aria-label="Try again"
			>
				<ArrowClockwise className={barStyles.icon} />
			</button>
			<button
				type="button"
				className={item}
				onClick={() => void saveAndShow()}
				disabled={state.kind === "saving"}
				title={
					state.kind === "saved"
						? "Report saved in Documents"
						: state.kind === "failed"
							? `Couldn’t save the report: ${state.message}`
							: "Save report"
				}
				aria-label={state.kind === "saved" ? "Report saved" : "Save report"}
			>
				{state.kind === "saved" ? (
					<Check className={barStyles.icon} />
				) : (
					<DownloadSimple className={barStyles.icon} />
				)}
			</button>
		</>
	);
	if (bubble)
		return (
			<div
				role="alert"
				aria-label="The camera bubble stopped working"
				className="flex h-screen w-screen items-center justify-center gap-1 rounded-full bg-black/70"
			>
				{buttons}
			</div>
		);
	return (
		<div ref={rootRef} className={barStyles.root}>
			<div
				role="alert"
				aria-label={`The ${windowType === "recording-controls" ? "recording" : "start"} bar stopped working`}
				className={`${barStyles.bar} ${barStyles.compact}${onGlass ? ` ${barStyles.onGlass}` : ""}`}
			>
				<span className={barStyles.item} aria-hidden="true">
					<WarningCircleIcon className={barStyles.icon} />
					Something went wrong
				</span>
				{buttons}
			</div>
		</div>
	);
}
