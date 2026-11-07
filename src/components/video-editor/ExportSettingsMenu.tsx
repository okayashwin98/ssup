import { Card, Description, Label, Tag, TagGroup } from "@heroui/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import type {
	ExportEncodingMode,
	ExportMp4FrameRate,
	ExportPipelineModel,
	ExportQuality,
} from "@/lib/exporter";
import { MP4_FRAME_RATES } from "@/lib/exporter";

// Exports are always MP4.
interface ExportSettingsMenuProps {
	exportQuality: ExportQuality;
	onExportQualityChange?: (quality: ExportQuality) => void;
	exportEncodingMode: ExportEncodingMode;
	onExportEncodingModeChange?: (encodingMode: ExportEncodingMode) => void;
	mp4FrameRate: ExportMp4FrameRate;
	onMp4FrameRateChange?: (frameRate: ExportMp4FrameRate) => void;
	exportPipelineModel?: ExportPipelineModel;
	experimentalNvidiaCudaExport?: boolean;
	onExperimentalNvidiaCudaExportChange?: (enabled: boolean) => void;
	nvidiaCudaExportAvailable?: boolean;
	showCaptionSidecarOption?: boolean;
	includeCaptionSidecar?: boolean;
	onIncludeCaptionSidecarChange?: (enabled: boolean) => void;
	mp4OutputDimensions?: Record<ExportQuality, { width: number; height: number }>;
	onExport?: () => void;
	className?: string;
	hideHeading?: boolean;
	hideAction?: boolean;
}

export function Choices<T extends string | number>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: ReactNode; textValue?: string; description?: string }[];
	onChange?: (value: T) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label>{label}</Label>
			<TagGroup
				aria-label={label}
				selectionMode="single"
				disallowEmptySelection
				selectedKeys={[String(value)]}
				onSelectionChange={(keys) => {
					if (keys === "all") return;
					const selected = options.find((option) => keys.has(String(option.value)));
					if (selected) onChange?.(selected.value);
				}}
				size="lg"
			>
				<TagGroup.List className="flex gap-2">
					{options.map((option) => (
						<Tag
							key={option.value}
							id={String(option.value)}
							textValue={
								option.textValue ??
								(typeof option.label === "string"
									? option.label
									: String(option.value))
							}
							className="h-auto min-h-10 min-w-0 flex-1 justify-center flex-col gap-0.5 px-1.5 py-2"
						>
							{option.label}
							{option.description && (
								<span className="whitespace-nowrap text-[10px] tabular-nums opacity-70">
									{option.description}
								</span>
							)}
						</Tag>
					))}
				</TagGroup.List>
			</TagGroup>
		</div>
	);
}
export function ExportSettingsMenu({
	exportQuality,
	onExportQualityChange,
	exportEncodingMode,
	onExportEncodingModeChange,
	mp4FrameRate,
	onMp4FrameRateChange,
	exportPipelineModel = "modern",
	experimentalNvidiaCudaExport = false,
	onExperimentalNvidiaCudaExportChange,
	nvidiaCudaExportAvailable = false,
	showCaptionSidecarOption = false,
	includeCaptionSidecar = false,
	onIncludeCaptionSidecarChange,
	mp4OutputDimensions,
	onExport,
	className,
	hideHeading = false,
	hideAction = false,
}: ExportSettingsMenuProps) {
	const tSettings = useScopedT("settings");
	const isLegacyModel = exportPipelineModel === "legacy";

	return (
		<Card className={className}>
			{!hideHeading && (
				<Card.Header>
					<Card.Title>{tSettings("export.title", "Export")}</Card.Title>
				</Card.Header>
			)}
			<Card.Content className="gap-4">
				<Choices
					label={tSettings("export.qualityTitle", "Quality")}
					value={exportQuality}
					onChange={onExportQualityChange}
					options={(["medium", "good", "high", "source"] as const).map(
						(value, index) => ({
							value,
							label: tSettings(
								`export.quality.${["low", "medium", "high", "original"][index]}`,
							),
							description: mp4OutputDimensions
								? `${mp4OutputDimensions[value].width} × ${mp4OutputDimensions[value].height}`
								: undefined,
						}),
					)}
				/>
				<Choices
					label={tSettings("export.encodingTitle", "Encoding")}
					value={exportEncodingMode}
					onChange={onExportEncodingModeChange}
					options={(["fast", "balanced", "quality"] as const).map((value) => ({
						value,
						label: tSettings(
							`export.encoding.${value}`,
							{ fast: "Fast", balanced: "Balanced", quality: "Quality" }[value],
						),
					}))}
				/>
				<Choices
					label={tSettings("export.fpsTitle", "FPS")}
					value={mp4FrameRate}
					onChange={onMp4FrameRateChange}
					options={MP4_FRAME_RATES.map((value) => ({
						value,
						label: String(value),
					}))}
				/>
				{!isLegacyModel && nvidiaCudaExportAvailable && (
					<Switch
						checked={experimentalNvidiaCudaExport}
						onCheckedChange={onExperimentalNvidiaCudaExportChange}
					>
						<Label>{tSettings("export.nvidiaCuda.title", "NVIDIA CUDA")}</Label>
					</Switch>
				)}
				{showCaptionSidecarOption && (
					<div>
						<Switch
							checked={includeCaptionSidecar}
							onCheckedChange={onIncludeCaptionSidecarChange}
						>
							<Label>
								{tSettings("export.captionSidecar.title", "Export captions file")}
							</Label>
						</Switch>
						<Description>
							{tSettings(
								"export.captionSidecar.hint",
								"Save .srt and .vtt files next to your exported video.",
							)}
						</Description>
					</div>
				)}
			</Card.Content>
			{!hideAction && (
				<Card.Footer>
					<Button onClick={onExport} className="w-full">
						{tSettings("export.exportVideo", undefined, { format: "Video" })}
					</Button>
				</Card.Footer>
			)}
		</Card>
	);
}
