// Decimal units, matching how macOS Finder reports file sizes.
export function formatFileSize(bytes: number | undefined): string | null {
	if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return null;
	const kilobytes = bytes / 1000;
	if (kilobytes < 1000) return `${Math.max(1, Math.round(kilobytes))} KB`;
	const megabytes = kilobytes / 1000;
	if (megabytes < 1000) return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
	const gigabytes = megabytes / 1000;
	return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} GB`;
}
