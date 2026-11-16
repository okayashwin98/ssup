/** Replaces passwords, tokens and the given secret values; file paths and other text stay as they are. */
export function scrubSecrets(text: string, secrets: Array<string | null | undefined> = []): string {
	let result = text;
	// Longest first, so a secret that contains another is removed whole.
	const given = secrets.map((value) => value?.trim() ?? "");
	// A secret address is also hidden when only its host shows up (another path on it).
	for (const value of [...given]) {
		try {
			if (/^https?:\/\//i.test(value)) given.push(new URL(value).host);
		} catch {
			// Not an address.
		}
	}
	const values = [...new Set(given.filter((v) => v.length >= 6))].sort(
		(a, b) => b.length - a.length,
	);
	for (const value of values) result = result.split(value).join("[removed]");
	return result
		.replace(/Bearer\s+[^\s"']+/gi, "Bearer [removed]")
		.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[removed token]")
		.replace(
			/((?:token|password|passwd|secret|authorization|api[_-]?key|access[_-]?key|\bsignature|\bsig)["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi,
			"$1[removed]",
		);
}
