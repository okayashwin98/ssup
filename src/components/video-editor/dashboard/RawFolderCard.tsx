import { useState } from "react";
import { FolderSimple } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/fileSize";
import { formatRelativeDate } from "@/lib/relativeDate";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import { RawThumbnail } from "./RawRecordings";

/** A project's raw folder in the Raw section; opening it lists the files inside. */
export function RawFolderCard({
	name,
	entries,
	onOpen,
}: {
	name: string;
	entries: ProjectLibraryEntry[];
	onOpen: () => void;
}) {
	const [hovering, setHovering] = useState(false);
	// Prefer the screen recording over the camera video for the preview.
	const cover =
		entries.find((entry) => !/-webcam\./i.test(entry.name) && entry.rawSource) ?? entries[0];
	const bytes = entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0);
	const latest = Math.max(...entries.map((entry) => entry.recordedAt ?? entry.updatedAt));
	const count = `${entries.length} ${entries.length === 1 ? "file" : "files"}`;
	return (
		<li className="group min-w-0">
			<Button
				variant="ghost"
				aria-label={`Open folder ${name}`}
				onPointerEnter={(event) => {
					if (event.pointerType === "mouse") setHovering(true);
				}}
				onPointerLeave={() => setHovering(false)}
				onClick={onOpen}
				className="relative block h-auto w-full min-w-0 rounded-xl p-0"
			>
				{cover?.rawSource && <RawThumbnail entry={cover.rawSource} active={hovering} />}
			</Button>
			<div className="flex min-w-0 items-start gap-2 pt-5">
				<FolderSimple
					weight="fill"
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
				/>
				<div className="min-w-0 flex-1">
					<p title={name} className="truncate text-[12px] font-medium leading-5">
						{name}
					</p>
					<p className="mt-1 text-[11px] text-muted-foreground">
						{[count, formatFileSize(bytes), formatRelativeDate(latest)]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>
			</div>
		</li>
	);
}
