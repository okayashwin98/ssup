import { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/fileSize";
import { CloudStorageSection } from "../cloud/CloudStorageMeter";

interface LocalUsage {
	totalBytes: number;
	freeBytes: number;
	appBytes: number;
}

/** Splits the disk into SuperShare, everything else, and free space (bytes and bar widths). */
export function localStorageBreakdown({ totalBytes, freeBytes, appBytes }: LocalUsage) {
	const otherBytes = Math.max(0, totalBytes - freeBytes - appBytes);
	const percent = (bytes: number) => (totalBytes > 0 ? (bytes / totalBytes) * 100 : 0);
	return {
		otherBytes,
		// Keep a sliver visible when the app's share is tiny; the legend carries the exact amount.
		appPercent: appBytes > 0 ? Math.max(1, percent(appBytes)) : 0,
		otherPercent: percent(otherBytes),
	};
}

function LocalStorageSection() {
	// undefined while loading, null when the disk can't be read.
	const [usage, setUsage] = useState<LocalUsage | null>();
	useEffect(() => {
		let active = true;
		const refresh = () => {
			// Wrapped so an older bridge without this call shows "unavailable" instead of failing.
			void Promise.resolve()
				.then(() => window.electronAPI.getLocalStorageUsage())
				.then((result) => {
					if (active) setUsage(result.success ? result : null);
				})
				.catch(() => {
					if (active) setUsage(null);
				});
		};
		refresh();
		window.addEventListener("focus", refresh);
		return () => {
			active = false;
			window.removeEventListener("focus", refresh);
		};
	}, []);

	const breakdown = usage ? localStorageBreakdown(usage) : null;
	const size = (bytes: number) => formatFileSize(bytes) ?? "0 MB";
	return (
		<section aria-label="Local storage">
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-[12px] font-medium text-foreground/80">Local storage</p>
				{usage ? (
					<p className="text-[11px] tabular-nums text-muted-foreground">
						{size(usage.totalBytes)}
					</p>
				) : null}
			</div>
			<div
				role="img"
				aria-label={
					usage && breakdown
						? `SuperShare ${size(usage.appBytes)}, everything else ${size(breakdown.otherBytes)}, free ${size(usage.freeBytes)}`
						: "Local storage"
				}
				className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-sm bg-default"
			>
				{breakdown ? (
					<>
						<div
							className="h-full bg-accent"
							style={{ width: `${breakdown.appPercent}%` }}
						/>
						<div
							className="h-full bg-foreground/25"
							style={{ width: `${breakdown.otherPercent}%` }}
						/>
					</>
				) : null}
			</div>
			{usage && breakdown ? (
				<ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
					<LegendRow swatch="bg-accent" label="SuperShare" value={size(usage.appBytes)} />
					<LegendRow
						swatch="bg-foreground/25"
						label="Everything else"
						value={size(breakdown.otherBytes)}
					/>
					<LegendRow
						swatch="border border-foreground/20 bg-default"
						label="Free"
						value={size(usage.freeBytes)}
					/>
				</ul>
			) : (
				<p className="mt-1.5 text-[11px] text-muted-foreground">
					{usage === undefined ? "Checking storage…" : "Storage unavailable"}
				</p>
			)}
		</section>
	);
}

function LegendRow({ swatch, label, value }: { swatch: string; label: string; value: string }) {
	return (
		<li className="flex items-center gap-1.5">
			<span className={`size-2 shrink-0 rounded-full ${swatch}`} />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="tabular-nums">{value}</span>
		</li>
	);
}

/** Cloud storage (when signed in) and this computer's storage, in one box. */
export function StorageCard({ token }: { token?: string | null }) {
	return (
		<div className="mt-2 rounded-xl border border-foreground/10 bg-default/40 px-3 py-2.5">
			{token ? (
				<>
					<CloudStorageSection token={token} />
					<hr className="my-2.5 border-foreground/10" />
				</>
			) : null}
			<LocalStorageSection />
		</div>
	);
}
