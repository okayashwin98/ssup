import { Tooltip } from "@heroui/react";
import { type ComponentType, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, BoundingBox, ImageSquare, TextT } from "@/components/ui/icons";
import { useScopedT } from "@/contexts/I18nContext";
import type { AnnotationType } from "../types";

type Props = {
	disabled: boolean;
	onAdd: (type: AnnotationType) => void;
};

/** Same order, icons and names as the type picker in the annotation settings. */
const TOOLS: Array<{
	type: AnnotationType;
	labelKey: string;
	icon: ComponentType<{ className?: string }>;
}> = [
	{ type: "text", labelKey: "annotations.text", icon: TextT },
	{ type: "image", labelKey: "annotations.image", icon: ImageSquare },
	{ type: "figure", labelKey: "annotations.arrow", icon: ArrowRight },
	{ type: "blur", labelKey: "annotations.blur", icon: BoundingBox },
];

/** Vertical strip beside the preview: one button per annotation type, added at the playhead. */
export function AnnotationToolbar({ disabled, onAdd }: Props) {
	const t = useScopedT("editor");
	const toolbarRef = useRef<HTMLDivElement>(null);
	return (
		<div
			ref={toolbarRef}
			role="toolbar"
			aria-label={t("annotations.tools", "Annotation tools")}
			aria-orientation="vertical"
			className="editor-annotation-tools absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2"
			onKeyDown={(event) => {
				if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
				const buttons = Array.from(
					toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
						"button:not(:disabled)",
					) ?? [],
				);
				if (!buttons.length) return;
				event.preventDefault();
				const index = buttons.indexOf(event.target as HTMLButtonElement);
				const next =
					event.key === "Home"
						? 0
						: event.key === "End"
							? buttons.length - 1
							: (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
								buttons.length;
				buttons[next]?.focus();
			}}
		>
			{TOOLS.map(({ type, labelKey, icon: Icon }) => (
				<Tooltip key={type}>
					<Button
						variant="ghost"
						size="icon"
						disabled={disabled}
						aria-label={t(labelKey)}
						data-no-auto-tooltip=""
						onClick={() => onAdd(type)}
					>
						<Icon className="h-4 w-4" />
					</Button>
					<Tooltip.Content placement="left">{t(labelKey)}</Tooltip.Content>
				</Tooltip>
			))}
		</div>
	);
}
