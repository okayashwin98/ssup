import { Button as HeroButton } from "@heroui/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ColorControl, ColorPalette } from "@/components/ui/color-picker";
import { Plus, X } from "@/components/ui/icons";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import {
	type CustomGradient,
	createCustomGradient,
	DEFAULT_CUSTOM_GRADIENT,
	isGradientWallpaper,
	MAX_GRADIENT_COLORS,
	MAX_SAVED_BACKGROUNDS,
	normalizeCustomColors,
	normalizeCustomGradients,
	PRESET_GRADIENTS,
	parseCustomGradient,
} from "@/lib/backgroundGradients";
import { loadEditorPreferences, saveEditorPreferences } from "./editorPreferences";
import { SliderControl } from "./SliderControl";

const removeTileClass =
	"absolute right-0.5 top-0.5 z-10 size-5 min-w-0 rounded-full p-0 bg-overlay text-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

/** Preset colours, then the user's saved colours (kept across projects), then the free picker. */
export function ColorBackgroundPicker({
	value,
	presets,
	onChange,
}: {
	value: string;
	presets: readonly string[];
	onChange: (color: string) => void;
}) {
	const tSettings = useScopedT("settings");
	const [saved, setSaved] = useState(() => loadEditorPreferences().customColors);
	const current = value.toLowerCase();
	const isPreset = presets.some((preset) => preset.toLowerCase() === current);
	const isSaved = saved.includes(current);
	const store = (next: string[]) => {
		const normalized = normalizeCustomColors(next);
		setSaved(normalized);
		saveEditorPreferences({ customColors: normalized });
	};
	return (
		<div className="flex flex-col gap-3">
			<ColorPalette
				color={value}
				colors={[
					...presets,
					...saved.filter((color) => !presets.some((p) => p.toLowerCase() === color)),
				]}
				onChange={({ hex }) => onChange(hex)}
			/>
			<div className="flex items-center gap-2">
				<ColorControl
					label={tSettings("background.customColor", "Custom color")}
					value={value}
					onChange={onChange}
				/>
				{isSaved ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted"
						aria-label={tSettings(
							"background.removeCustomColor",
							"Remove custom color",
						)}
						onClick={() => store(saved.filter((color) => color !== current))}
					>
						{tSettings("background.removeColor", "Remove color")}
					</Button>
				) : (
					!isPreset && (
						<Button
							variant="ghost"
							size="sm"
							className="text-xs text-muted"
							disabled={saved.length >= MAX_SAVED_BACKGROUNDS}
							onClick={() => store([...saved, current])}
						>
							{tSettings("background.saveColor", "Save color")}
						</Button>
					)
				)}
			</div>
		</div>
	);
}

/** Create tile, the user's saved gradients (kept across projects), then the presets. */
export function GradientBackgroundPicker({
	value,
	onChange,
	tileClassName,
}: {
	value: string;
	onChange: (gradient: string) => void;
	tileClassName: (selected: boolean) => string;
}) {
	const tSettings = useScopedT("settings");
	const { t } = useI18n();
	const [saved, setSaved] = useState(() => loadEditorPreferences().customGradients);
	const [draft, setDraft] = useState<CustomGradient | null>(null);
	// A project can use a custom gradient that was later removed from the saved list: still show it.
	const customOptions =
		isGradientWallpaper(value) && !PRESET_GRADIENTS.includes(value) && !saved.includes(value)
			? [...saved, value]
			: saved;
	const store = (next: string[]) => {
		const normalized = normalizeCustomGradients(next);
		setSaved(normalized);
		saveEditorPreferences({ customGradients: normalized });
	};
	const preview = draft ? createCustomGradient(draft) : "";
	const updateColor = (index: number, color: string) =>
		setDraft((d) => d && { ...d, colors: d.colors.map((c, i) => (i === index ? color : c)) });

	const tile = (gradient: string, label: string, removable: boolean) => (
		<div
			key={`${removable ? "custom" : "preset"}-${gradient}`}
			className="group relative min-w-0"
		>
			<Button
				variant="ghost"
				className={tileClassName(value === gradient)}
				aria-label={label}
				aria-pressed={value === gradient}
				data-no-auto-tooltip=""
				onClick={() => onChange(gradient)}
				role="button"
			>
				<div
					className="absolute inset-[1px] overflow-hidden rounded-[8px]"
					style={{ background: gradient }}
				/>
			</Button>
			{removable && (
				<HeroButton
					variant="secondary"
					isIconOnly
					aria-label={`${tSettings("background.remove", "Remove")} ${label}`}
					data-tooltip={tSettings("background.removeGradient", "Remove gradient")}
					onPress={() => {
						store(saved.filter((item) => item !== gradient));
						if (value === gradient) onChange(PRESET_GRADIENTS[0]);
					}}
					className={removeTileClass}
				>
					<X className="size-3" />
				</HeroButton>
			)}
		</div>
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="mt-0 grid grid-cols-5 gap-2">
				<HeroButton
					variant="secondary"
					isIconOnly
					aria-label={tSettings(
						"background.createCustomGradient",
						"Create custom gradient",
					)}
					aria-expanded={draft !== null}
					onPress={() =>
						setDraft(
							draft ? null : (parseCustomGradient(value) ?? DEFAULT_CUSTOM_GRADIENT),
						)
					}
					className="aspect-[4/3] h-auto w-full min-w-0 rounded-md p-0 text-muted"
				>
					<Plus className="size-4" />
				</HeroButton>
				{customOptions.map((gradient, index) =>
					tile(
						gradient,
						tSettings("background.customGradientNumber", "Custom gradient {{number}}", {
							number: index + 1,
						}),
						true,
					),
				)}
				{PRESET_GRADIENTS.map((gradient, index) =>
					tile(gradient, `Gradient ${index + 1}`, false),
				)}
			</div>
			{draft && (
				<section
					aria-label={tSettings("background.customGradient", "Custom gradient")}
					className="flex flex-col gap-3"
				>
					<div
						role="img"
						aria-label={tSettings("background.gradientPreview", "Gradient preview")}
						className="h-16 rounded-lg ring-1 ring-inset ring-foreground/10"
						style={{ background: preview }}
					/>
					{draft.colors.map((color, index) => {
						const label = tSettings("background.colorNumber", "Color {{number}}", {
							number: index + 1,
						});
						return (
							<div key={index} className="flex items-center justify-between gap-2">
								<span className="text-xs">{label}</span>
								<div className="flex items-center gap-1">
									<ColorControl
										compact
										label={label}
										value={color}
										onChange={(next) => updateColor(index, next)}
									/>
									{draft.colors.length > 2 && (
										<HeroButton
											isIconOnly
											variant="ghost"
											size="sm"
											aria-label={tSettings(
												"background.removeColorNumber",
												"Remove color {{number}}",
												{ number: index + 1 },
											)}
											className="text-muted"
											onPress={() =>
												setDraft(
													(d) =>
														d && {
															...d,
															colors: d.colors.filter(
																(_, i) => i !== index,
															),
														},
												)
											}
										>
											<X className="size-3.5" />
										</HeroButton>
									)}
								</div>
							</div>
						);
					})}
					<Button
						variant="secondary"
						size="sm"
						className="self-start"
						disabled={draft.colors.length >= MAX_GRADIENT_COLORS}
						onClick={() =>
							setDraft(
								(d) =>
									d && {
										...d,
										colors: [...d.colors, d.colors[d.colors.length - 1]],
									},
							)
						}
					>
						<Plus className="size-3.5" />
						{tSettings("background.addColor", "Add color")}
					</Button>
					<SliderControl
						label={tSettings("background.angle", "Angle")}
						value={draft.angle}
						min={0}
						max={359}
						step={1}
						onChange={(angle) => setDraft((d) => d && { ...d, angle })}
						formatValue={(angle) => `${Math.round(angle)}°`}
					/>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
							{t("common.actions.cancel", "Cancel")}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								if (!PRESET_GRADIENTS.includes(preview)) {
									store([...saved.filter((item) => item !== preview), preview]);
								}
								onChange(preview);
								setDraft(null);
							}}
						>
							{tSettings("background.saveGradient", "Save gradient")}
						</Button>
					</div>
				</section>
			)}
		</div>
	);
}
