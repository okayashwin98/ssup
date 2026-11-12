import { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/fileSize";
import { CloudStorageSection } from "../cloud/CloudStorageMeter";

/** How much space the app's data takes on this computer. */
function LocalStorageSection() {
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
		</section>
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
