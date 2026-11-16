import { loadAppSetting } from "@/lib/appSettings";
import { recentDiagnosticLogs, rendererSecrets } from "./diagnostics";
import { scrubSecrets } from "./scrubSecrets";

type ReportContext = { screen?: string; projectPath?: string | null };
let context: ReportContext = {};

/** The editor says which screen is showing and which project is open, for reports. */
export function setReportContext(next: ReportContext) {
	context = { ...context, ...next };
}

const EXPORT_SETTING_KEYS = [
	"exportFormat",
	"exportQuality",
	"exportEncodingMode",
	"exportBackendPreference",
	"exportPipelineModel",
	"mp4FrameRate",
	"gifFrameRate",
	"gifLoop",
	"gifSizePreset",
	"publishDestination",
	"shareResolution",
	"includeCaptionSidecar",
];

function exportSettings() {
	const preferences = loadAppSetting<Record<string, unknown>>("recordly.editor.preferences");
	if (!preferences || typeof preferences !== "object") return null;
	return Object.fromEntries(
		EXPORT_SETTING_KEYS.filter((key) => key in preferences).map((key) => [
			key,
			preferences[key],
		]),
	);
}

export type ReportableError = { message?: string; stack?: string; componentStack?: string };

export function toReportableError(error: unknown, componentStack?: string | null): ReportableError {
	if (error instanceof Error)
		return {
			message: error.message || error.name,
			stack: error.stack,
			componentStack: componentStack ?? undefined,
		};
	return {
		message: String(error ?? "Unknown error"),
		componentStack: componentStack ?? undefined,
	};
}

/** What "Copy details" puts on the clipboard: the error, where it happened, and its stacks. */
export function errorDetailsText(error: ReportableError, windowType: string) {
	return scrubSecrets(
		[
			`SuperShare — ${windowType || "app"} window${context.screen ? ` (${context.screen})` : ""}`,
			`Time (UTC): ${new Date().toISOString()}`,
			"",
			error.message ?? "Unknown error",
			error.stack ? `\n${error.stack}` : "",
			error.componentStack ? `\nComponent stack:${error.componentStack}` : "",
		]
			.filter((line) => line !== "")
			.join("\n"),
		rendererSecrets(),
	);
}

/** Asks the app to write the report file into Documents. Nothing leaves the Mac. */
export async function saveErrorReport(
	reason: "crash" | "project-load" | "menu",
	error?: ReportableError,
	screen?: string,
) {
	const save = window.electronAPI?.saveErrorReport;
	if (!save) throw new Error("Reports can only be saved in the desktop app.");
	const secrets = rendererSecrets();
	const scrub = (text?: string) => (text ? scrubSecrets(text, secrets) : undefined);
	let settings: Record<string, unknown> | null = null;
	try {
		settings = exportSettings();
	} catch {
		settings = null;
	}
	const result = await save({
		reason,
		screen: screen ?? context.screen,
		error: error
			? {
					message: scrub(error.message),
					stack: scrub(error.stack),
					componentStack: scrub(error.componentStack),
				}
			: undefined,
		logs: recentDiagnosticLogs(),
		exportSettings: settings,
		editorProjectPath: context.projectPath ?? null,
	});
	if (!result.success && !result.canceled) throw new Error(result.error || "Could not save");
	return result;
}
