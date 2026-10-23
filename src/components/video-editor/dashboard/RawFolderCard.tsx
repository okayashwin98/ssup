import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/fileSize";
import { formatRelativeDate } from "@/lib/relativeDate";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import { FrostedFolder } from "./FrostedFolder";

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
				// No card behind the folder, so no hover fill either.
				className="relative block h-auto w-full min-w-0 overflow-visible rounded-xl !bg-transparent p-0"
			>
				<FrostedFolder
					sources={entries.flatMap((entry) => (entry.rawSource ? [entry.rawSource] : []))}
					open={hovering}
				/>
			</Button>
			<div className="min-w-0 pt-5">
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
