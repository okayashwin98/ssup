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
		<>
			{/* Gap above the grid sits inside the scroller, so hover lifts are not clipped. */}
			<main
				className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto px-7 pb-10 lg:px-10 ${section === "settings" || section === "shared" ? "" : "pt-7"}`}
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
						<div>
							<SharedRecordings
								key={authToken}
								token={authToken}
								endpoint={CLOUD_SHARE_ENDPOINT}
								standalone
							/>
						</div>
					) : (
						<div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
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
					<div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
						{!isRaw && !hasActiveFilters ? (
							<span aria-hidden="true" className="text-4xl">
								🦗
							</span>
						) : (
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
		</>
	);
}
