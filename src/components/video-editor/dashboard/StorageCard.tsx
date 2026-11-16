import { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/fileSize";
import { CloudStorageSection } from "../cloud/CloudStorageMeter";
import { FreeUpSpaceDialog } from "./FreeUpSpaceDialog";

/** How much space the app's data takes on this computer. */
function LocalStorageSection({ onFreeUpSpace }: { onFreeUpSpace: () => void }) {
	// undefined while loading, null when it can't be measured.
	const [bytes, setBytes] = useState<number | null>();
	useEffect(() => {
		let active = true;
		const refresh = () => {
			// Wrapped so an older bridge without this call shows "unavailable" instead of failing.
			void Promise.resolve()
				.then(() => window.electronAPI.getLocalStorageUsage())
				.then((result) => {
					if (active) setBytes(result.success ? result.bytes : null);
				})
				.catch(() => {
					if (active) setBytes(null);
				});
		};
		refresh();
		window.addEventListener("focus", refresh);
		return () => {
			active = false;
			window.removeEventListener("focus", refresh);
		};
	}, []);

	return (
		<section aria-label="Local storage">
			<p className="text-[12px] font-medium text-foreground/80">Local storage</p>
			<p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
				{bytes === undefined
					? "Checking storage…"
					: bytes === null
						? "Storage unavailable"
						: (formatFileSize(bytes) ?? "0 MB")}
			</p>
			<button
				type="button"
				className="mt-1 rounded text-[11px] font-medium text-foreground/70 underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-focus"
				onClick={onFreeUpSpace}
			>
				Free up space…
			</button>
		</section>
	);
}

/** Cloud storage (when signed in) and this computer's storage, in one box. */
export function StorageCard({ token }: { token?: string | null }) {
	const [cleaning, setCleaning] = useState(false);
	// Bumped after files move to the Trash, so the size is measured again.
	const [measure, setMeasure] = useState(0);
	return (
		<div className="mt-2 rounded-xl border border-foreground/10 bg-default/40 px-3 py-2.5">
			{token ? (
				<>
					<CloudStorageSection token={token} />
					<hr className="my-2.5 border-foreground/10" />
				</>
			) : null}
			<LocalStorageSection key={measure} onFreeUpSpace={() => setCleaning(true)} />
			<FreeUpSpaceDialog
				open={cleaning}
				onClose={() => setCleaning(false)}
				onFreed={() => setMeasure((count) => count + 1)}
			/>
		</div>
	);
}
