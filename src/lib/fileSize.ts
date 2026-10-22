export function formatFileSize(bytes: number | undefined): string | null {
	if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return null;
	const kilobytes = bytes / 1024;
	if (kilobytes < 1024) return `${Math.max(1, Math.round(kilobytes))} KB`;
	const megabytes = kilobytes / 1024;
	if (megabytes < 1024) return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
	return `${(megabytes / 1024).toFixed(1)} GB`;
}
