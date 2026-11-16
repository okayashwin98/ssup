import { useRef } from "react";
import { LibrarySkeleton } from "./LibrarySkeleton";
import { SharedRecordings } from "../cloud/SharedRecordings";
import { CLOUD_SHARE_ENDPOINT } from "../cloud/endpoint";
import { RecordNewButton } from "./RecordNewButton";
import { RawPreview } from "./RawRecordings";
import { Cloud, ImageSquare } from "@/components/ui/icons";
import { RawFolderCard } from "./RawFolderCard";

import { Button } from "@/components/ui/button";

import { DashboardSettings } from "./DashboardSettings";

import { ProjectCard } from "./ProjectCard";
import type { DashboardProps } from "./types";

import type { DashboardModel } from "./useDashboardModel";
import { useScrollEdgeFade } from "./useScrollEdgeFade";

export function DashboardGrid({
	onImportFile,
	loading,
	isRaw,
	rawPreview,
	setRawPreview,
	rawLoading,
	rawError,
	refreshRaw,
	error,
	section,
	authToken,
	onSignIn,
	onShareProject,
	visible,
	busy,
	selecting,
	toggleSelected,
	onRenameProject,
	folders,
	save,
	assignFolder,
	selected,
	openEntry,
	query,
	hasActiveFilters,
	setQuery,
	run,
	deleteEntries,
}: Pick<
	DashboardProps & DashboardModel,
	| "loading"
	| "onImportFile"
	| "isRaw"
	| "rawPreview"
	| "setRawPreview"
	| "rawLoading"
	| "rawError"
	| "refreshRaw"
	| "error"
	| "section"
	| "authToken"
	| "onSignIn"
	| "onShareProject"
	| "visible"
	| "busy"
	| "selecting"
	| "toggleSelected"
	| "onRenameProject"
	| "folders"
	| "save"
	| "assignFolder"
	| "selected"
	| "openEntry"
	| "query"
	| "hasActiveFilters"
	| "setQuery"
	| "deleteEntries"
	| "run"
>) {
	const scroller = useRef<HTMLElement>(null);
	const topFade = useRef<HTMLDivElement>(null);
	const bottomFade = useRef<HTMLDivElement>(null);
	useScrollEdgeFade(scroller, topFade, bottomFade);
	// Raw shows one card per project folder, which opens in Finder, then the loose files.
	const folderOf = (entry: (typeof visible)[number]) => entry.rawSource?.folder ?? null;
	const rawFolders = new Map<string, typeof visible>();
	if (isRaw)
		for (const entry of visible) {
			const folder = folderOf(entry);
			if (folder) rawFolders.set(folder, [...(rawFolders.get(folder) ?? []), entry]);
		}
	const cards = isRaw ? visible.filter((entry) => !folderOf(entry)) : visible;
	const openRawFolder = (name: string) =>
		run(async () => {
			const result = await window.electronAPI.openRawFolder(name);
			if (!result.success) throw new Error(result.error || "Could not open folder");
		});
	const renderCard = (entry: (typeof visible)[number]) => (
		<ProjectCard
			key={entry.path}
			onDelete={() => void deleteEntries([entry.path])}
			{...{
				entry,
				busy,
				selecting,
				selected,
				toggleSelected,
				openEntry,
				run,
				onShareProject,
				onRenameProject,
				folders,
				save,
				assignFolder,
			}}
		/>
	);
	return (
		// The fades take the card's own colour and stay clear of the scrollbar.
		<div className="relative flex min-h-0 flex-1 flex-col bg-inherit">
			{/* Gap above the grid sits inside the scroller, so hover lifts are not clipped. */}
			{/* A column, so an empty state can fill the pane and centre itself in it. */}
			<main
				ref={scroller}
				className={`custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-10 lg:px-10 ${section === "settings" || section === "shared" ? "" : "pt-7"}`}
			>
				{error && (
					<p role="alert" className="mb-4 text-sm text-danger">
						{error}
					</p>
				)}
				{section === "settings" ? (
					<DashboardSettings onImportFile={onImportFile} />
				) : section === "shared" ? (
					authToken && CLOUD_SHARE_ENDPOINT ? (
						<div className="flex flex-1 flex-col">
							<SharedRecordings
								key={authToken}
								token={authToken}
								endpoint={CLOUD_SHARE_ENDPOINT}
								standalone
							/>
						</div>
					) : (
						<div className="-mb-10 flex min-h-40 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
							<Cloud weight="fill" className="size-8 opacity-40" />
							<p>
								{authToken
									? "Cloud sharing is not available in this build yet."
									: "Sign in to manage shared videos."}
							</p>
							{!authToken && (
								<Button variant="secondary" onClick={onSignIn}>
									Sign in
								</Button>
							)}
						</div>
					)
				) : (isRaw ? rawLoading : loading) ? (
					<LibrarySkeleton />
				) : cards.length || rawFolders.size ? (
					<ul
						aria-label={isRaw ? "Raw files" : "Your projects"}
						className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-x-7 gap-y-10 lg:gap-x-9"
					>
						{[...rawFolders].map(([name, entries]) => (
							<RawFolderCard
								key={name}
								name={name}
								entries={entries}
								onOpen={() => void openRawFolder(name)}
							/>
						))}
						{cards.map(renderCard)}
					</ul>
				) : (
					// The negative margins cancel the scroller's padding: centred in the whole pane.
					<div className="-mb-10 -mt-7 flex min-h-40 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
						{(isRaw || hasActiveFilters) && (
							<ImageSquare weight="fill" className="size-8 opacity-30" />
						)}
						<p>
							{isRaw
								? rawLoading
									? "Loading recordings…"
									: rawError ||
										(hasActiveFilters
											? "No matching raw files"
											: "No raw recordings yet")
								: hasActiveFilters
									? "No matching projects"
									: "It's looking empty in here..."}
						</p>
						{!isRaw && !hasActiveFilters && (
							<RecordNewButton busy={busy} run={run} first className="mt-2" />
						)}
						{isRaw && rawError && (
							<Button onClick={() => void refreshRaw()}>Retry</Button>
						)}
						{query && (
							<Button variant="ghost" size="sm" onClick={() => setQuery("")}>
								Clear search
							</Button>
						)}
					</div>
				)}
				<RawPreview entry={rawPreview} onClose={() => setRawPreview(null)} />
			</main>
			<div
				ref={topFade}
				aria-hidden="true"
				className="pointer-events-none absolute left-0 right-3 top-0 z-10 h-6 bg-inherit opacity-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]"
			/>
			<div
				ref={bottomFade}
				aria-hidden="true"
				className="pointer-events-none absolute bottom-0 left-0 right-3 z-10 h-6 bg-inherit opacity-0 [mask-image:linear-gradient(to_top,#000,transparent)]"
			/>
		</div>
	);
}
