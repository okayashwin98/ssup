import { Separator } from "@heroui/react";
import type { CSSProperties, FormEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
	FilmStrip,
	House,
	ArrowUUpRight as Redo2,
	ArrowUUpLeft as Undo2,
} from "@/components/ui/icons";
import type { useI18n } from "@/contexts/I18nContext";
import type { ShareResolution } from "@/lib/exporter/types";
import type { useExportDimensions } from "../export/useExportDimensions";
import type { useExportSession } from "../export/useExportSession";
import type { useExportSettings } from "../export/useExportSettings";
import type { useExportStatusViewModel } from "../export/useExportStatusViewModel";
import type { useVideoEditorPresets } from "../presets/useVideoEditorPresets";
import type { useProjectState } from "../state/useProjectState";
import { EditorExportMenu } from "./EditorExportMenu";
import { EditorPresetMenu } from "./EditorPresetMenu";

// Keep the preset implementation available for future use.
const SHOW_PRESETS_BUTTON = true;

type Props = {
	clipsOpen: boolean;
	onToggleClips: () => void;
	t: ReturnType<typeof useI18n>["t"];
	headerLeftControlsPaddingClass: string;
	project: ReturnType<typeof useProjectState>;
	projectBrowserTriggerRef: RefObject<HTMLButtonElement | null>;
	projectNameInputRef: RefObject<HTMLInputElement | null>;
	projectDisplayName: string;
	hasUnsavedChanges: boolean;
	canUndo: boolean;
	canRedo: boolean;
	handleOpenProjectBrowser: () => void;
	handleUndo: () => void;
	handleRedo: () => void;
	handleProjectNameSubmit: (event?: FormEvent<HTMLFormElement>) => void;
	closeProjectNameEditor: () => void;
	presets: ReturnType<typeof useVideoEditorPresets>;
	exportSettings: ReturnType<typeof useExportSettings>;
	exportSession: ReturnType<typeof useExportSession>;
	exportDimensions: ReturnType<typeof useExportDimensions>;
	exportStatus: ReturnType<typeof useExportStatusViewModel>;
	hasCaptionsForSidecar: boolean;
	/** The editor's captions, timed to the export, for the share page's CC. */
	shareCaptionCues?: Array<{ startMs: number; endMs: number; text: string }>;
	nvidiaCudaExportAvailable: boolean;
	experimentalNvidiaCudaExport: boolean;
	setExperimentalNvidiaCudaExport: (enabled: boolean) => void;
	handleOpenExportDropdown: () => void;
	handleExportDropdownClose: () => void;
	handleCancelExport: () => void;
	handleRetrySaveExport: () => void;
	handleStartExportFromDropdown: () => void;
	revealExportedFile: () => void;
	exportMessage: string | null;
	prepareExportForShare: (resolution?: ShareResolution) => Promise<string | undefined>;
	shareRequestNonce: number;
	shareToken?: string;
};

export function EditorHeader(props: Props) {
	const {
		t,
		headerLeftControlsPaddingClass,
		project,
		projectBrowserTriggerRef,
		projectNameInputRef,
		projectDisplayName,
		canUndo,
		canRedo,
		handleOpenProjectBrowser,
		handleUndo,
		handleRedo,
		handleProjectNameSubmit,
		closeProjectNameEditor,
		presets,
		exportSettings,
		exportSession,
		exportDimensions,
		exportStatus,
		hasCaptionsForSidecar,
		shareCaptionCues,
		nvidiaCudaExportAvailable,
		experimentalNvidiaCudaExport,
		setExperimentalNvidiaCudaExport,
		handleOpenExportDropdown,
		handleExportDropdownClose,
		handleCancelExport,
		handleRetrySaveExport,
		handleStartExportFromDropdown,
		revealExportedFile,
		exportMessage,
	} = props;
	const {
		isEditingProjectName,
		setIsEditingProjectName,
		projectNameDraft,
		setProjectNameDraft,
		isSavingProjectName,
	} = project;

	return (
		<header
			className="editor-header [--text-sm:0.8125rem] relative z-50 grid h-14 shrink-0 border-b border-separator grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4"
			// Drag areas swallow clicks, so drop dragging while renaming to let a click outside end it.
			style={{ WebkitAppRegion: isEditingProjectName ? "no-drag" : "drag" } as CSSProperties}
		>
			{/* Empty header space drags the window; controls opt out via the base no-drag rule. */}
			<div
				className={`editor-header-start flex min-w-0 items-center gap-1 ${headerLeftControlsPaddingClass}`}
			>
				<Button
					ref={projectBrowserTriggerRef}
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleOpenProjectBrowser}
					className="shrink-0 gap-2 px-3"
					title="Home"
					aria-label="Home"
				>
					<House weight="fill" className="h-4 w-4" />
					<span>Home</span>
				</Button>
				<span
					aria-hidden="true"
					className="mx-2 shrink-0 text-xl font-light text-muted-foreground/60"
				>
					/
				</span>

				<div className="editor-header-title flex min-w-0 items-center">
					{isEditingProjectName ? (
						<form
							onSubmit={(event) => void handleProjectNameSubmit(event)}
							className="flex w-full min-w-0 items-center gap-1.5 px-2"
						>
							{/* Exactly as wide as the name (an invisible copy sets the width), so nothing
							    beside the title moves when renaming starts. */}
							<span className="inline-grid min-w-0 max-w-full">
								<span
									aria-hidden="true"
									className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre text-sm font-semibold tracking-tight"
								>
									{projectNameDraft || " "}
								</span>
								<input
									ref={projectNameInputRef}
									type="text"
									value={projectNameDraft}
									onChange={(event) => setProjectNameDraft(event.target.value)}
									onBlur={() => {
										if (
											!isSavingProjectName &&
											projectNameDraft.trim() !== projectDisplayName
										)
											void handleProjectNameSubmit();
										else if (!isSavingProjectName) closeProjectNameEditor();
									}}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											event.preventDefault();
											closeProjectNameEditor();
										}
									}}
									disabled={isSavingProjectName}
									className="inline-project-name col-start-1 row-start-1 h-8 w-[calc(100%+12px)] min-w-0 -translate-y-px text-sm font-semibold tracking-tight text-foreground/90 disabled:cursor-wait"
									size={1}
									aria-label={t("editor.project.renameInput", "Project name")}
								/>
							</span>
						</form>
					) : (
						<Button
							variant="ghost"
							type="button"
							onClick={() => setIsEditingProjectName(true)}
							className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2"
							title={t("editor.project.renameTitle", "Rename project")}
							aria-label={t("editor.project.renameTitle", "Rename project")}
						>
							<span className="truncate text-sm font-semibold tracking-tight text-foreground/90">
								{projectDisplayName}
							</span>
						</Button>
					)}
				</div>
				<Separator orientation="vertical" className="mx-3 h-5 shrink-0 self-center" />
				<Button
					variant="secondary"
					size="sm"
					className="shrink-0 gap-2"
					aria-expanded={props.clipsOpen}
					onClick={props.onToggleClips}
				>
					<FilmStrip weight={props.clipsOpen ? "fill" : "regular"} className="size-4" />
					Clips
				</Button>
			</div>

			<div className="editor-header-end flex min-w-0 items-center justify-self-end gap-3">
				<div className="flex items-center gap-1">
					<Separator orientation="vertical" className="mx-3 h-5 shrink-0 self-center" />
					<Button
						type="button"
						variant="ghost"
						onClick={handleUndo}
						disabled={!canUndo}
						size="icon"
						className="disabled:cursor-not-allowed"
						title={t("common.actions.undo", "Undo")}
						aria-label={t("common.actions.undo", "Undo")}
					>
						<Undo2 className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={handleRedo}
						disabled={!canRedo}
						size="icon"
						className="disabled:cursor-not-allowed"
						title={t("common.actions.redo", "Redo")}
						aria-label={t("common.actions.redo", "Redo")}
					>
						<Redo2 className="h-4 w-4" />
					</Button>
				</div>
				{SHOW_PRESETS_BUTTON && <EditorPresetMenu t={t} presets={presets} />}
				<EditorExportMenu
					t={t}
					exportSettings={exportSettings}
					exportSession={exportSession}
					exportDimensions={exportDimensions}
					exportStatus={exportStatus}
					hasCaptionsForSidecar={hasCaptionsForSidecar}
					shareCaptionCues={shareCaptionCues}
					nvidiaCudaExportAvailable={nvidiaCudaExportAvailable}
					experimentalNvidiaCudaExport={experimentalNvidiaCudaExport}
					setExperimentalNvidiaCudaExport={setExperimentalNvidiaCudaExport}
					handleOpenExportDropdown={handleOpenExportDropdown}
					handleExportDropdownClose={handleExportDropdownClose}
					handleCancelExport={handleCancelExport}
					handleRetrySaveExport={handleRetrySaveExport}
					handleStartExportFromDropdown={handleStartExportFromDropdown}
					revealExportedFile={revealExportedFile}
					exportMessage={exportMessage}
					projectPath={project.currentProjectPath}
					projectTitle={projectDisplayName}
					prepareExportForShare={props.prepareExportForShare}
					shareRequestNonce={props.shareRequestNonce}
					shareToken={props.shareToken}
				/>
			</div>
		</header>
	);
}
