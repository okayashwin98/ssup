import { Dropdown } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, BookmarkSimple, CaretDown, Check, DotsThree } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import type { useVideoEditorPresets } from "../presets/useVideoEditorPresets";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	presets: ReturnType<typeof useVideoEditorPresets>;
};

export function EditorPresetMenu({ t, presets }: Props) {
	const {
		editorPresets,
		presetPopoverOpen,
		setPresetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
		currentEditorPreset,
		handleApplyEditorPreset,
		handleUpdateEditorPreset,
		handleRenameEditorPreset,
		handleDeleteEditorPreset,
		handleSavePresetSubmit,
	} = presets;
	const [editingId, setEditingId] = useState<string | null>(null);
	const [nameDraft, setNameDraft] = useState("");
	// Stops the blur that follows Enter or Escape from committing a second time.
	const editingRef = useRef<string | null>(null);

	useEffect(() => {
		if (!presetPopoverOpen) {
			editingRef.current = null;
			setEditingId(null);
		}
	}, [presetPopoverOpen]);

	const startRename = (presetId: string, name: string) => {
		setNameDraft(name);
		editingRef.current = presetId;
		requestAnimationFrame(() => requestAnimationFrame(() => setEditingId(presetId)));
	};
	const finishRename = (save: boolean) => {
		const presetId = editingRef.current;
		editingRef.current = null;
		setEditingId(null);
		if (save && presetId) handleRenameEditorPreset(presetId, nameDraft);
	};

	return (
		<Popover open={presetPopoverOpen} onOpenChange={setPresetPopoverOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					type="button"
					title={t("editor.presets.open", "Open presets")}
					aria-label={t("editor.presets.open", "Open presets")}
					className="inline-flex min-w-0 max-w-40 items-center gap-2 px-3 text-sm"
				>
					<span className="flex min-w-0 items-center gap-2">
						<BookmarkSimple weight="fill" className="h-4 w-4" />
						<span className="truncate">
							{currentEditorPreset?.name ?? t("editor.presets.label", "Presets")}
						</span>
					</span>
					<CaretDown className="h-3.5 w-3.5 text-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={10}
				aria-label="Presets"
				className="w-[320px] p-4"
			>
				<div className="space-y-4">
					<h3 className="text-sm font-medium">{t("editor.presets.label", "Presets")}</h3>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							handleSavePresetSubmit();
						}}
						className="space-y-2"
					>
						<p className="text-xs font-medium text-foreground">
							{t("editor.presets.saveCurrentAs", "Save current preset as")}
						</p>
						<div className="flex items-center gap-2">
							<Input
								value={presetNameDraft}
								onChange={(event) => setPresetNameDraft(event.target.value)}
								className="h-9 min-w-0 flex-1 text-[13px]"
								placeholder={t("editor.presets.namePlaceholder", "Preset name")}
								aria-label={t("editor.presets.namePlaceholder", "Preset name")}
							/>
							<Button type="submit" size="sm" className="shrink-0 px-3">
								{t("common.actions.save", "Save")}
							</Button>
						</div>
					</form>
					<div className="space-y-2">
						<p className="text-xs font-medium text-foreground">
							{t("editor.presets.savedList", "Saved presets")}
						</p>
						<div className="flex max-h-56 flex-col gap-1 overflow-y-auto custom-scrollbar">
							{editorPresets.length === 0 ? (
								<div className="rounded-lg bg-default px-3 py-4 text-center text-[11px] text-muted-foreground">
									{t("editor.presets.empty", "No presets yet.")}
								</div>
							) : (
								editorPresets.map((preset) => {
									const isActive = preset.id === currentEditorPreset?.id;
									return (
										<div
											key={preset.id}
											className={cn(
												"flex h-8 min-w-0 shrink-0 items-center gap-0.5 rounded-[10px] text-[13px] transition-colors",
												isActive
													? "bg-default/70 text-foreground"
													: "text-muted hover:bg-default/40 hover:text-foreground",
											)}
										>
											{editingId === preset.id ? (
												<form
													className="min-w-0 flex-1"
													onSubmit={(event) => {
														event.preventDefault();
														finishRename(true);
													}}
												>
													<Input
														autoFocus
														onFocus={(event) =>
															event.currentTarget.select()
														}
														aria-label={t(
															"editor.presets.namePlaceholder",
															"Preset name",
														)}
														className="h-8 w-full min-w-0 text-[13px]"
														value={nameDraft}
														onChange={(event) =>
															setNameDraft(event.target.value)
														}
														onBlur={() => finishRename(true)}
														onKeyDown={(event) => {
															if (event.key === "Escape") {
																// Cancel the rename without closing the popover.
																event.preventDefault();
																event.stopPropagation();
																finishRename(false);
															}
														}}
													/>
												</form>
											) : (
												<button
													type="button"
													onClick={() =>
														handleApplyEditorPreset(preset.id)
													}
													className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
												>
													<span className="truncate">{preset.name}</span>
													{isActive ? (
														<Check className="h-3.5 w-3.5 shrink-0 text-accent" />
													) : null}
												</button>
											)}
											<Button
												variant="ghost"
												type="button"
												size="icon"
												onClick={() => handleUpdateEditorPreset(preset.id)}
												className="shrink-0"
												aria-label={t(
													"editor.presets.updateAriaLabel",
													"Update {{name}} with current settings",
													{ name: preset.name },
												)}
												data-tooltip="Update preset"
											>
												<ArrowClockwise />
											</Button>
											<Dropdown>
												<Button
													variant="ghost"
													size="icon"
													className="shrink-0"
													aria-label={t(
														"editor.presets.optionsAriaLabel",
														"Preset options",
													)}
													data-tooltip="Options"
												>
													<DotsThree weight="bold" />
												</Button>
												<Dropdown.Popover>
													<Dropdown.Menu
														aria-label={t(
															"editor.presets.optionsAriaLabel",
															"Preset options",
														)}
													>
														<Dropdown.Item
															id="rename"
															onAction={() =>
																startRename(preset.id, preset.name)
															}
														>
															{t("editor.presets.rename", "Rename")}
														</Dropdown.Item>
														<Dropdown.Item
															id="delete"
															variant="danger"
															className="text-danger"
															onAction={() =>
																handleDeleteEditorPreset(preset.id)
															}
														>
															{t(
																"editor.presets.delete",
																"Delete preset",
															)}
														</Dropdown.Item>
													</Dropdown.Menu>
												</Dropdown.Popover>
											</Dropdown>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
