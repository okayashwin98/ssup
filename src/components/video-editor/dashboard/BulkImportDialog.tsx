import { Modal } from "@heroui/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderSimple } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PROJECT_LIBRARY_CHANGED_EVENT } from "../project/useProjectLibraryController";
import type { MediaBatchPick } from "../project/useProjectOpenActions";
import { FOLDER_COLORS, loadProjectFolders, type ProjectFolder } from "./useProjectFolders";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type Step =
	| { kind: "choose" }
	| { kind: "importing"; done: number; name: string; stopping: boolean }
	| {
			kind: "done";
			imported: number;
			skipped: number;
			failed: { name: string; message: string }[];
			canceled: boolean;
			folderName: string | null;
	  }
	| { kind: "error"; message: string };

/**
 * Imports many videos at once, each as its own project, into no folder, an existing
 * folder or a new one. Opened by Home's Import button when several videos or a folder
 * are picked.
 */
export function BulkImportDialog({
	batch,
	folders,
	save,
	initialFolderId,
	onClose,
	onShowFolder,
}: {
	batch: MediaBatchPick | null;
	folders: ProjectFolder[];
	save: (folders: ProjectFolder[]) => void;
	/** The folder Home is showing, if any; it becomes the default destination. */
	initialFolderId: string | null;
	onClose: () => void;
	onShowFolder: (id: string) => void;
}) {
	const [step, setStep] = useState<Step>({ kind: "choose" });
	const [destination, setDestination] = useState("new");
	const [newName, setNewName] = useState("");
	const [shownFolderId, setShownFolderId] = useState<string | null>(null);
	// Reset only when a new batch arrives, not when folders change mid-dialog.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!batch) return;
		setStep({ kind: "choose" });
		setDestination(
			initialFolderId && folders.some((folder) => folder.id === initialFolderId)
				? initialFolderId
				: "new",
		);
		setNewName(batch.folderName?.trim() || "Imported videos");
		setShownFolderId(null);
	}, [batch]);
	useEffect(
		() =>
			window.electronAPI.onMediaBatchImportProgress((progress) =>
				setStep((current) =>
					current.kind === "importing"
						? { ...current, done: progress.done, name: progress.name }
						: current,
				),
			),
		[],
	);
	if (!batch) return null;
	const total = batch.names.length;
	const busy = step.kind === "importing";
	const canImport = destination !== "new" || newName.trim().length > 0;

	const start = async () => {
		setStep({ kind: "importing", done: 0, name: batch.names[0] ?? "", stopping: false });
		const result = await window.electronAPI
			.importMediaBatch(batch.batchId)
			.catch((error: unknown) => ({
				success: false,
				message: error instanceof Error ? error.message : String(error),
			}));
		if (!result.success) {
			setStep({ kind: "error", message: result.message || "Could not import the videos" });
			return;
		}
		const imported = "imported" in result ? (result.imported ?? []) : [];
		let folderName: string | null = null;
		if (imported.length && destination !== "none") {
			// Read the latest folders: they may have changed while the import ran.
			const list = loadProjectFolders();
			if (destination === "new") {
				const used = new Set(list.map((folder) => folder.color));
				const folder: ProjectFolder = {
					id: crypto.randomUUID(),
					name: newName.trim().slice(0, 80),
					color: FOLDER_COLORS.find((color) => !used.has(color)) ?? FOLDER_COLORS[0],
					paths: imported,
				};
				save([...list, folder]);
				folderName = folder.name;
				setShownFolderId(folder.id);
			} else {
				const target = list.find((folder) => folder.id === destination);
				if (target) {
					save(
						list.map((folder) =>
							folder.id === destination
								? {
										...folder,
										paths: [...new Set([...folder.paths, ...imported])],
									}
								: folder,
						),
					);
					folderName = target.name;
					setShownFolderId(target.id);
				}
			}
		}
		window.dispatchEvent(new Event(PROJECT_LIBRARY_CHANGED_EVENT));
		setStep({
			kind: "done",
			imported: imported.length,
			skipped: ("skipped" in result ? result.skipped?.length : 0) ?? 0,
			failed: ("failed" in result ? result.failed : []) ?? [],
			canceled: Boolean("canceled" in result && result.canceled),
			folderName,
		});
	};

	const finish = () => {
		if (shownFolderId) onShowFolder(shownFolderId);
		onClose();
	};

	return (
		<Modal
			isOpen
			onOpenChange={(next) => {
				if (!next && !busy) (step.kind === "done" ? finish : onClose)();
			}}
		>
			<Modal.Backdrop isDismissable={!busy}>
				<Modal.Container size="md" placement="center">
					<Modal.Dialog aria-label="Import videos" className="gap-4">
						{!busy && <Modal.CloseTrigger />}
						<Modal.Header>
							<Modal.Heading>Import {plural(total, "video")}</Modal.Heading>
							<p className="text-[13px] text-muted-foreground">
								Each video becomes its own project. SuperShare keeps its own copy,
								so the originals can be moved or deleted afterwards.
							</p>
						</Modal.Header>
						<Modal.Body>
							{step.kind === "choose" && (
								<div className="space-y-4">
									<div className="space-y-1.5">
										<span className="block text-xs text-muted-foreground">
											Add to
										</span>
										<Select
											aria-label="Folder to import into"
											value={destination}
											onValueChange={(value) =>
												value && setDestination(value)
											}
										>
											<SelectTrigger className="w-full text-[13px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="new" textValue="New folder">
													New folder
												</SelectItem>
												<SelectItem value="none" textValue="No folder">
													No folder
												</SelectItem>
												{folders.map((folder) => (
													<SelectItem
														key={folder.id}
														value={folder.id}
														textValue={folder.name}
													>
														<span className="flex min-w-0 items-center gap-2">
															<FolderSimple
																weight="fill"
																className="size-3.5 shrink-0"
																style={{ color: folder.color }}
															/>
															<span className="truncate">
																{folder.name}
															</span>
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									{destination === "new" && (
										<div className="space-y-1.5">
											<span className="block text-xs text-muted-foreground">
												Folder name
											</span>
											<Input
												aria-label="New folder name"
												value={newName}
												maxLength={80}
												onChange={(event) => setNewName(event.target.value)}
												className="h-9 w-full text-[13px]"
											/>
										</div>
									)}
									<ul
										aria-label="Videos to import"
										className="custom-scrollbar -mx-2 max-h-[min(14rem,35vh)] overflow-y-auto"
									>
										{batch.names.map((name, index) => (
											<li
												key={`${index}-${name}`}
												className="truncate rounded-lg px-2 py-1 text-[13px] text-muted-foreground"
												title={name}
											>
												{name}
											</li>
										))}
									</ul>
								</div>
							)}
							{step.kind === "importing" && (
								<div role="status" className="space-y-2 text-[13px]">
									<div className="h-1.5 overflow-hidden rounded-full bg-default/60">
										<div
											className="h-full rounded-full bg-accent transition-[width] duration-300"
											style={{
												width: `${(step.done / Math.max(1, total)) * 100}%`,
											}}
										/>
									</div>
									<p>
										{step.stopping
											? "Stopping after this video…"
											: `Importing ${Math.min(step.done + 1, total)} of ${total}`}
									</p>
									{step.name && (
										<p
											className="truncate text-muted-foreground"
											title={step.name}
										>
											{step.name}
										</p>
									)}
								</div>
							)}
							{step.kind === "done" && (
								<div role="status" className="space-y-2 text-[13px]">
									<p>
										{step.imported
											? `Imported ${plural(step.imported, "video")}${step.folderName ? ` into “${step.folderName}”` : ""}.`
											: "No videos were imported."}
									</p>
									{step.skipped > 0 && (
										<p className="text-muted-foreground">
											{plural(step.skipped, "video")}{" "}
											{step.skipped === 1 ? "was" : "were"} already in
											SuperShare and skipped.
										</p>
									)}
									{step.canceled && (
										<p className="text-muted-foreground">
											Stopped early. Import the same videos again to finish;
											the ones already in are skipped.
										</p>
									)}
									{step.failed.length > 0 && (
										<div className="space-y-1">
											<p className="text-danger">
												{plural(step.failed.length, "video")} could not be
												imported:
											</p>
											<ul className="custom-scrollbar max-h-32 overflow-y-auto text-xs text-muted-foreground">
												{step.failed.map((item, index) => (
													<li
														key={`${index}-${item.name}`}
														className="truncate"
														title={item.message}
													>
														{item.name}
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
							)}
							{step.kind === "error" && (
								<p role="alert" className="text-[13px] text-danger">
									{step.message.replace(/^Error:\s*/, "")}
								</p>
							)}
						</Modal.Body>
						<Modal.Footer>
							{step.kind === "choose" ? (
								<>
									<Button variant="ghost" onClick={onClose}>
										Cancel
									</Button>
									<Button disabled={!canImport} onClick={() => void start()}>
										Import {plural(total, "video")}
									</Button>
								</>
							) : step.kind === "importing" ? (
								<Button
									variant="ghost"
									disabled={step.stopping}
									onClick={() => {
										setStep({ ...step, stopping: true });
										void window.electronAPI.cancelMediaBatchImport();
									}}
								>
									Stop
								</Button>
							) : (
								<Button variant="secondary" onClick={finish}>
									Done
								</Button>
							)}
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
