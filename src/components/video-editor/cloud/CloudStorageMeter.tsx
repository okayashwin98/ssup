import { ProgressBar } from "@heroui/react";
import { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/fileSize";
import { CLOUD_SHARE_ENDPOINT } from "./endpoint";
import { subscribeShareCapacityChanges } from "./shareCapacity";

// Cloudflare R2's free storage allowance.
export const CLOUD_STORAGE_FREE_BYTES = 10_000_000_000;

export function cloudStoragePercent(usedBytes: number): number {
	if (usedBytes <= 0) return 0;
	// Keep a sliver visible for small libraries; the caption carries the exact amount.
	return Math.min(100, Math.max(1, (usedBytes / CLOUD_STORAGE_FREE_BYTES) * 100));
}

export function CloudStorageMeter({ token }: { token: string }) {
	// undefined while loading, null when the share service can't be reached.
	const [usedBytes, setUsedBytes] = useState<number | null>();
	useEffect(() => {
		let active = true;
		const refresh = () => {
			void window.electronAPI
				.cloudShareManage({ endpoint: CLOUD_SHARE_ENDPOINT, token, action: "list" })
				.then((result) => {
					if (!active) return;
					setUsedBytes(
						result.success && Array.isArray(result.videos)
							? result.videos.reduce((total, video) => total + (video.size || 0), 0)
							: null,
					);
				})
				.catch(() => {
					if (active) setUsedBytes(null);
				});
		};
		const unsubscribe = subscribeShareCapacityChanges(refresh);
		refresh();
		return () => {
			active = false;
			unsubscribe();
		};
	}, [token]);

	const caption =
		usedBytes === undefined
			? "Checking storage…"
			: usedBytes === null
				? "Storage unavailable"
				: `${formatFileSize(usedBytes) ?? "0 MB"} of ${formatFileSize(CLOUD_STORAGE_FREE_BYTES)} used`;
	return (
		<div
			className="mt-2 rounded-xl border border-foreground/10 bg-default/40 px-3 py-2.5"
			aria-label="Cloud storage"
		>
			<p className="text-[12px] font-medium text-foreground/80">Cloud storage</p>
			<ProgressBar
				aria-label="Cloud storage used"
				isIndeterminate={usedBytes === undefined}
				value={usedBytes ? cloudStoragePercent(usedBytes) : 0}
				className="mt-1.5"
			>
				<ProgressBar.Track>
					<ProgressBar.Fill />
				</ProgressBar.Track>
			</ProgressBar>
			<p className="mt-1.5 text-[11px] text-muted-foreground">{caption}</p>
		</div>
	);
}
