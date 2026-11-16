import { type ComponentProps, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorExportMenu } from "@/components/video-editor/layout/EditorExportMenu";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import "@/index.css";
import { loadEditorPreferences } from "@/components/video-editor/editorPreferences";
import { useExportSettings } from "@/components/video-editor/export/useExportSettings";

const noop = () => undefined;
let finishUpload: (() => void) | undefined;
let reportUpload:
	| ((event: { uploadId: string; uploadedBytes: number; totalBytes: number }) => void)
	| undefined;
window.electronAPI = {
	cloudShareManage: async ({ token }: { token: string }) => ({
		success: true,
		videos:
			token === "fixture" && new URLSearchParams(location.search).has("full")
				? Array(5).fill({ ready: true })
				: [],
	}),
	onCloudShareProgress: (callback: typeof reportUpload) => {
		reportUpload = callback;
		return () => {
			reportUpload = undefined;
		};
	},
	discardExportedTemp: async () => ({}),
	cloudShareUpload: async ({ uploadId }: { uploadId: string }) => {
		await new Promise((resolve) => setTimeout(resolve, 800));
		reportUpload?.({ uploadId, uploadedBytes: 50, totalBytes: 100 });
		if (new URLSearchParams(location.search).has("controlled")) {
			await new Promise<void>((resolve) => {
				finishUpload = resolve;
			});
		} else {
			await new Promise((resolve) => setTimeout(resolve, 12000));
		}
		if (new URLSearchParams(location.search).has("fail"))
			throw new Error("Fixture old-account upload failed");
		return { success: true, shareUrl: "https://example.test/s/preview" };
	},
	cloudShareCancel: async () => ({ success: true }),
} as unknown as typeof window.electronAPI;
function Preview() {
	const [open, setOpen] = useState(false);
	const [shareToken, setShareToken] = useState<string | undefined>("fixture");
	const [percentage, setPercentage] = useState(0);
	const { t } = useI18n();
	const [preferences] = useState(loadEditorPreferences);
	const exportSettings = useExportSettings(preferences, [], []);
	const props = {
		t,
		projectTitle: "Preview",
		shareToken,
		shareRequestNonce: 0,
		exportSettings,
		exportSession: {
			showExportDropdown: open,
			setShowExportDropdown: setOpen,
			exportProgress: { percentage },
		},
		exportDimensions: {
			gifOutputDimensions: { width: 800, height: 450 },
			mp4OutputDimensions: {
				medium: { width: 1280, height: 720 },
				good: { width: 1920, height: 1080 },
				high: { width: 2560, height: 1440 },
				source: { width: 3024, height: 1898 },
			},
		},
		exportStatus: {},
		handleOpenExportDropdown: () => setOpen(true),
		handleExportDropdownClose: () => setOpen(false),
		handleCancelExport: noop,
		handleStartExportFromDropdown: noop,
		prepareExportForShare: async () => {
			setPercentage(0);
			await new Promise((resolve) => setTimeout(resolve, 800));
			setPercentage(50);
			await new Promise((resolve) => setTimeout(resolve, 800));
			setPercentage(100);
			return "synthetic-preview.mp4";
		},
	} as unknown as ComponentProps<typeof EditorExportMenu>;
	return (
		<div className="flex justify-end p-12">
			{new URLSearchParams(location.search).has("switch") && (
				<div>
					<button type="button" onClick={() => finishUpload?.()}>
						Fixture finish upload
					</button>
					<button type="button" onClick={() => setShareToken("refreshed-fixture")}>
						Fixture refresh token
					</button>
					<button type="button" onClick={() => setShareToken(undefined)}>
						Fixture remove password
					</button>
				</div>
			)}
			<EditorExportMenu {...props} />
		</div>
	);
}
createRoot(document.getElementById("root")!).render(
	<I18nProvider>
		<Preview />
	</I18nProvider>,
);
