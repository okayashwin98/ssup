import { Checkbox, Modal } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { File, MusicNotes } from "@/components/ui/icons";
import { formatFileSize } from "@/lib/fileSize";
import type { UnusedRecording } from "@/types/recordingLibrary";

const isVideo = (name: string) => /\.(mp4|mov|webm|mkv|m4v)$/i.test(name);
const isAudio = (name: string) => /\.(wav|m4a|mp3|ogg|flac)$/i.test(name);
const size = (bytes: number) => formatFileSize(bytes) ?? "0 KB";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "recording-1731234567890.mp4" carries its start time; fall back to the file's date. */
export function unusedRecordingTitle(entry: UnusedRecording) {
	const stamp = Number(/^recording-(\d{12,14})/i.exec(entry.name)?.[1]);
	const when = new Date(Number.isFinite(stamp) && stamp > 0 ? stamp : entry.modifiedAt);
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
		when,
	);
}

function Poster({ entry }: { entry: UnusedRecording }) {
	const [poster, setPoster] = useState<string>();
	useEffect(() => {
		let active = true;
		if (isVideo(entry.name))
			void Promise.resolve()
				.then(() => window.electronAPI.getRecordingThumbnail(entry.path))
				.then((result) => {
					if (active && result.success) setPoster(result.value);
				})
				.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [entry.path, entry.name]);
	return (
		<div className="flex aspect-[4/3] w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default/60">
			{poster ? (
				<img src={poster} alt="" className="h-full w-full object-cover" />
			) : isAudio(entry.name) ? (
				<MusicNotes weight="fill" className="size-5 text-muted-foreground/50" />
			) : (
				<File className="size-5 text-muted-foreground/50" />
			)}
		</div>
	);
}

type Step =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "review" }
	| { kind: "confirm" }
	| { kind: "moving" }
	| { kind: "done"; bytes: number; moved: number; kept: number; failed: number };

/**
 * Finds recordings no saved project uses and moves the ones you keep ticked to the Trash,
 * after showing what will go and how much space it frees. Nothing is deleted for good.
 */
export function FreeUpSpaceDialog({
	open,
	onClose,
	onFreed,
}: {
	open: boolean;
	onClose: () => void;
	onFreed?: () => void;
}) {
	const [entries, setEntries] = useState<UnusedRecording[]>([]);
	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [step, setStep] = useState<Step>({ kind: "loading" });

	useEffect(() => {
		if (!open) return;
		let active = true;
		setStep({ kind: "loading" });
		setExcluded(new Set());
		void Promise.resolve()
			.then(() => window.electronAPI.findUnusedRecordings())
			.then((result) => {
				if (!active) return;
				if (!result.success) {
					setStep({ kind: "error", message: result.error });
					return;
				}
				setEntries(result.value);
				setStep({ kind: "review" });
			})
			.catch((error) => {
				if (active) setStep({ kind: "error", message: String(error) });
			});
		return () => {
			active = false;
		};
	}, [open]);

	const selected = useMemo(
		() => entries.filter((entry) => !excluded.has(entry.path)),
		[entries, excluded],
	);
	const selectedBytes = selected.reduce((sum, entry) => sum + entry.bytes, 0);
	const selectedFiles = selected.reduce((sum, entry) => sum + entry.files.length, 0);
	const busy = step.kind === "moving";

	const moveToTrash = async () => {
		setStep({ kind: "moving" });
		try {
			const result = await window.electronAPI.trashUnusedRecordings(
				selected.map((entry) => entry.path),
			);
			if (!result.success) {
				setStep({ kind: "error", message: result.error });
				return;
			}
			const { trashed, kept, failed, bytes } = result.value;
			setStep({
				kind: "done",
				bytes,
				moved: selected.length - kept.length,
				kept: kept.length,
				failed: failed.length,
			});
			if (trashed.length) onFreed?.();
		} catch (error) {
			setStep({ kind: "error", message: String(error) });
		}
	};

	return (
		<Modal
			isOpen={open}
			onOpenChange={(next) => {
				if (!next && !busy) onClose();
			}}
		>
			<Modal.Backdrop isDismissable={!busy}>
				<Modal.Container size="md" placement="center">
					<Modal.Dialog aria-label="Free up space" className="gap-4">
						{!busy && <Modal.CloseTrigger />}
						<Modal.Header>
							<Modal.Heading>Free up space</Modal.Heading>
							<p className="text-[13px] text-muted-foreground">
								Recordings no saved project uses. They move to the Trash, so you can
								put them back from there.
							</p>
						</Modal.Header>
						<Modal.Body>
							{step.kind === "loading" && (
								<p role="status" className="text-[13px] text-muted-foreground">
									Checking your projects…
								</p>
							)}
							{step.kind === "error" && (
								<p role="alert" className="text-[13px] text-danger">
									{step.message.replace(/^Error:\s*/, "")}
								</p>
							)}
							{step.kind === "review" && !entries.length && (
								<p role="status" className="text-[13px] text-muted-foreground">
									Nothing to clean up. Every recording is used by a project.
								</p>
							)}
							{step.kind === "review" && entries.length > 0 && (
								<>
									<div className="flex items-center gap-2 pb-1">
										<Checkbox
											aria-label="Select all recordings"
											isSelected={selected.length === entries.length}
											isIndeterminate={
												selected.length > 0 &&
												selected.length < entries.length
											}
											onChange={(checked) =>
												setExcluded(
													checked
														? new Set()
														: new Set(
																entries.map((entry) => entry.path),
															),
												)
											}
										>
											<Checkbox.Content>
												<Checkbox.Control>
													<Checkbox.Indicator />
												</Checkbox.Control>
											</Checkbox.Content>
										</Checkbox>
										<span className="text-xs text-muted-foreground">
											{plural(entries.length, "recording")} not in any project
										</span>
									</div>
									<ul
										aria-label="Recordings to move to Trash"
										className="custom-scrollbar -mx-2 max-h-[min(22rem,50vh)] space-y-0.5 overflow-y-auto"
									>
										{entries.map((entry) => {
											const ticked = !excluded.has(entry.path);
											const toggle = (checked: boolean) =>
												setExcluded((previous) => {
													const next = new Set(previous);
													if (checked) next.delete(entry.path);
													else next.add(entry.path);
													return next;
												});
											return (
												<li
													key={entry.path}
													className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-default/50"
												>
													<Checkbox
														aria-label={`Move ${entry.name} to Trash`}
														isSelected={ticked}
														onChange={toggle}
													>
														<Checkbox.Content>
															<Checkbox.Control>
																<Checkbox.Indicator />
															</Checkbox.Control>
														</Checkbox.Content>
													</Checkbox>
													<button
														type="button"
														className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
														onClick={() => toggle(!ticked)}
														title={entry.files
															.map((file) => file.path)
															.join("\n")}
													>
														<Poster entry={entry} />
														<span className="min-w-0 flex-1">
															<span className="block truncate text-[13px] font-medium">
																{unusedRecordingTitle(entry)}
															</span>
															<span className="block truncate text-xs text-muted-foreground">
																{entry.folder
																	? `In the “${entry.folder}” folder`
																	: "In the recordings folder"}
																{entry.files.length > 1
																	? ` · ${plural(entry.files.length, "file")}`
																	: ""}
															</span>
														</span>
														<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
															{size(entry.bytes)}
														</span>
													</button>
												</li>
											);
										})}
									</ul>
								</>
							)}
							{(step.kind === "confirm" || step.kind === "moving") && (
								<div className="space-y-2 text-[13px]">
									<p>
										Move {plural(selected.length, "recording")} (
										{plural(selectedFiles, "file")}, {size(selectedBytes)}) to
										the Trash?
									</p>
									<p className="text-muted-foreground">
										No saved project uses them. Each one is checked again just
										before it moves, and any a project has started using is
										kept.
									</p>
								</div>
							)}
							{step.kind === "done" && (
								<div role="status" className="space-y-2 text-[13px]">
									<p>
										{step.moved
											? `Moved ${plural(step.moved, "recording")} (${size(step.bytes)}) to the Trash.`
											: "Nothing was moved."}
									</p>
									{step.kept > 0 && (
										<p className="text-muted-foreground">
											{plural(step.kept, "recording")} kept because a project
											now uses{step.kept === 1 ? " it" : " them"}.
										</p>
									)}
									{step.failed > 0 && (
										<p className="text-danger">
											{plural(step.failed, "file")} could not be moved and{" "}
											{step.failed === 1 ? "was" : "were"} left in place.
										</p>
									)}
									<p className="text-muted-foreground">
										Empty the Trash in Finder to get the space back.
									</p>
								</div>
							)}
						</Modal.Body>
						<Modal.Footer>
							{step.kind === "review" && entries.length > 0 ? (
								<>
									<Button variant="ghost" onClick={onClose}>
										Cancel
									</Button>
									<Button
										variant="destructive"
										disabled={!selected.length}
										onClick={() => setStep({ kind: "confirm" })}
									>
										Move to Trash · {size(selectedBytes)}
									</Button>
								</>
							) : step.kind === "confirm" || step.kind === "moving" ? (
								<>
									<Button
										variant="ghost"
										disabled={busy}
										onClick={() => setStep({ kind: "review" })}
									>
										Back
									</Button>
									<Button
										variant="destructive"
										disabled={busy}
										onClick={() => void moveToTrash()}
									>
										{busy ? "Moving to Trash…" : "Move to Trash"}
									</Button>
								</>
							) : (
								<Button variant="secondary" onClick={onClose}>
									{step.kind === "done" ? "Done" : "Close"}
								</Button>
							)}
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
