import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "@/components/feedback/AppErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { installFeedbackDiagnostics } from "@/lib/feedback/diagnostics";
import "@/index.css";

// Test-only: a component that fails until the page says it may recover.
const params = new URLSearchParams(location.search);
const windowType = params.get("window") ?? "editor";
const html = document.documentElement;
html.dataset.windowType = windowType;
// The bars sit on the Mac's dark glass; a dark page stands in for it here.
if (["hud-overlay", "recording-controls", "webcam-bubble"].includes(windowType))
	document.body.style.background = "#2b2b2e";
Object.assign(window, {
	electronAPI: {
		getAppSetting: (key: string) =>
			key === "recordly.editor.preferences"
				? { exportFormat: "mp4", exportQuality: "good" }
				: null,
		setAppSetting: () => true,
		saveErrorReport: async (input: unknown) => {
			html.dataset.savedReport = JSON.stringify(input);
			return {
				success: true,
				path: "/Users/test/Documents/SuperShare error report 2026-11-16 18-30-05.txt",
				askedWhere: false,
			};
		},
		revealInFolder: async (filePath: string) => {
			html.dataset.revealed = filePath;
			return { success: true };
		},
		copyTextToClipboard: async (text: string) => {
			html.dataset.copied = text;
			return { success: true };
		},
		sendRecordingControlsCommand: (command: string) => {
			html.dataset.command = command;
		},
		hudWindowSetContentSize: (size: { width: number; height: number }) => {
			html.dataset.contentSize = `${size.width}x${size.height}`;
		},
		hudWindowHasGlass: () => false,
	},
});
installFeedbackDiagnostics();
console.warn("Loaded /Users/test/Recordings/Demo/Demo.ssup with password=hunter22");

function Bomb() {
	const [recover] = useState(() => html.dataset.recover === "true");
	if (!recover) throw new TypeError("Cannot read properties of undefined (reading 'clips')");
	return <p>Recovered</p>;
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<ThemeProvider>
		<AppErrorBoundary windowType={windowType}>
			<Bomb />
		</AppErrorBoundary>
	</ThemeProvider>,
);
