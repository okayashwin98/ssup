/** Copy text, preferring the desktop app's clipboard since renderer clipboard access is refused. */
export async function copyText(text: string): Promise<void> {
	const copyThroughApp =
		typeof window !== "undefined" ? window.electronAPI?.copyTextToClipboard : undefined;
	if (copyThroughApp) {
		const result = await copyThroughApp(text);
		if (!result.success) throw new Error(result.error ?? "Could not copy");
		return;
	}
	await navigator.clipboard.writeText(text);
}
