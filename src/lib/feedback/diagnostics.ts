import { scrubSecrets } from "./scrubSecrets";

const entries: string[] = [];
let installed = false;

/** The share password and address and the other .env values never reach a report. */
export function rendererSecrets() {
	return [
		import.meta.env.VITE_CLOUD_SHARE_SECRET,
		import.meta.env.VITE_CLOUD_SHARE_ENDPOINT,
		import.meta.env.VITE_PROFILE_NAME,
	];
}
export function redactDiagnostic(value: string): string {
	return value
		.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
		.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[token]")
		.replace(
			/((?:token|password|secret|authorization|api[_-]?key)["']?\s*[:=]\s*)[^\s,}]+/gi,
			"$1[redacted]",
		)
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
		.replace(/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s"']+/gi, "[local path]")
		.replace(/https?:\/\/[^\s"']+/g, "[url]")
		.slice(0, 2000);
}
function record(level: string, args: unknown[]) {
	// Do not serialize arbitrary objects: they may contain session or project data.
	const message = args
		.map((value) =>
			value instanceof Error
				? (value.stack ?? value.message)
				: typeof value === "string"
					? value
					: `[${typeof value}]`,
		)
		.join(" ");
	// Full file paths stay: the owner reads these reports to debug. Secrets never do.
	entries.push(
		`${new Date().toISOString()} ${level}: ${scrubSecrets(message, rendererSecrets()).slice(0, 2000)}`,
	);
	if (entries.length > 100) entries.shift();
}
export function installFeedbackDiagnostics() {
	if (installed) return;
	installed = true;
	for (const level of ["warn", "error"] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			record(level, args);
			original(...args);
		};
	}
	window.addEventListener("error", (event) =>
		record("uncaught", [
			event.error instanceof Error && event.error.stack
				? event.error.stack
				: `${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
		]),
	);
	window.addEventListener("unhandledrejection", (event) => record("rejection", [event.reason]));
}
/** The last 100 warnings, errors and uncaught errors, oldest first, in UTC. */
export function recentDiagnosticLogs() {
	return [...entries];
}
const MAX_DIAGNOSTIC_BYTES = 290_000;
export function feedbackDiagnostics() {
	const metadata = {
		capturedAt: new Date().toISOString(),
		platform: navigator.platform.slice(0, 2000),
		userAgent: navigator.userAgent.slice(0, 2000),
	};
	const logs = [...entries];
	const encoder = new TextEncoder();
	let payload = JSON.stringify({ ...metadata, logs });
	while (encoder.encode(payload).byteLength > MAX_DIAGNOSTIC_BYTES && logs.length) {
		logs.shift();
		payload = JSON.stringify({ ...metadata, logs });
	}
	return payload;
}
