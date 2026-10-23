import { Check } from "@/components/ui/icons";
import { SettingsRow } from "@/components/video-editor/SettingsRow";
import { DEFAULT_ACCENT_COLOR, saveAccentColor, useAccentColor } from "@/lib/accentColor";

const SWATCHES = [
	{ name: "SuperShare purple", color: DEFAULT_ACCENT_COLOR },
	{ name: "Blue", color: "#006FEE" },
	{ name: "Green", color: "#17A34A" },
	{ name: "Orange", color: "#F97316" },
	{ name: "Pink", color: "#EC4899" },
	{ name: "Red", color: "#E5484D" },
];

/** Theme colour for buttons, selections and highlights across every app window. */
export function AccentColorSetting() {
	const accent = useAccentColor();
	const isCustom = !SWATCHES.some(({ color }) => color === accent);
	return (
		<SettingsRow title="Theme colour" stacked>
			<div role="radiogroup" aria-label="Theme colour" className="flex flex-wrap items-center gap-2">
				{SWATCHES.map(({ name, color }) => (
					<button
						key={color}
						type="button"
						role="radio"
						aria-checked={accent === color}
						aria-label={name}
						title={name}
						onClick={() => saveAccentColor(color)}
						className="flex size-8 items-center justify-center rounded-full outline-offset-2"
						style={{ background: color, color: "#fff" }}
					>
						{accent === color && <Check className="size-4" />}
					</button>
				))}
				<label
					title="Custom colour"
					className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full"
					style={{
						background: isCustom
							? accent
							: "conic-gradient(#ff5f5f, #ffd25f, #5fff8f, #5fc8ff, #a35fff, #ff5f5f)",
						color: "#fff",
					}}
				>
					{isCustom && <Check className="size-4" />}
					<input
						type="color"
						aria-label="Custom theme colour"
						value={accent.toLowerCase()}
						onChange={(event) => saveAccentColor(event.target.value)}
						className="absolute inset-0 cursor-pointer opacity-0"
					/>
				</label>
				<span className="ml-1 font-mono text-xs text-muted-foreground">{accent}</span>
			</div>
		</SettingsRow>
	);
}
