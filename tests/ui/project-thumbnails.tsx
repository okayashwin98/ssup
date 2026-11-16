/* Home cards with mock projects: a raw first frame is replaced by the finished edit. */
import { createRoot } from "react-dom/client";
import { ProjectThumbnail } from "@/components/video-editor/dashboard/ProjectThumbnail";
import "@/index.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle("dark", theme === "dark");

const styled = {
	wallpaper: "#8fa8b9",
	padding: { top: 14, right: 14, bottom: 14, left: 14 },
	borderRadius: 18,
	shadowIntensity: 0.6,
	clipRegions: [{ id: "clip", startMs: 0, endMs: 6000, sourceStartMs: 0, speed: 1 }],
};
const projects: Record<string, Record<string, unknown> | null> = {
	"/projects/styled.supershare": styled,
	// Saved before any look settings existed: rendered with the defaults.
	"/projects/old.supershare": {},
	// Recording missing: the raw frame must stay.
	"/projects/broken.supershare": null,
	"/projects/done.supershare": styled,
};
const cached: string[] = [];
let previewReads = 0;
// Renders wait for the test, so it can see what Home shows before any finish.
const released = new Promise<void>((resolve) =>
	window.addEventListener("release-renders", () => resolve(), { once: true }),
);
window.electronAPI = {
	getAssetBasePath: async () => "/",
	getCursorTelemetry: async () => ({ success: true, samples: [] }),
	getProjectPreview: async (projectPath: string) => {
		await released;
		previewReads++;
		document.documentElement.dataset.previewReads = String(previewReads);
		const editor = projects[projectPath];
		if (!editor) return { success: false, error: "The recording is missing." };
		return {
			success: true,
			value: {
				project: { version: 2, videoPath: "/recordings/demo.mp4", editor },
				videoUrl: "/tests/ui/fixtures/filmstrip.mp4",
				webcamUrl: null,
			},
		};
	},
	cacheProjectThumbnail: async (projectPath: string, _updatedAt: number, url: string) => {
		cached.push(`${projectPath}:${url.startsWith("data:image/png;base64,")}`);
		document.documentElement.dataset.cached = cached.join(",");
		return { success: true, value: `${projectPath}.png` };
	},
} as unknown as typeof window.electronAPI;

const raw = `${location.origin}/tests/ui/fixtures/recording-thumbnail.jpg`;
const cards = [
	{
		label: "Raw frame, edited project",
		projectPath: "/projects/styled.supershare",
		composed: false,
	},
	{
		label: "Old project, no saved look",
		projectPath: "/projects/old.supershare",
		composed: false,
	},
	{ label: "Recording missing", projectPath: "/projects/broken.supershare", composed: false },
	{ label: "Already finished edit", projectPath: "/projects/done.supershare", composed: true },
];
createRoot(document.getElementById("root")!).render(
	<main className="min-h-screen bg-background p-8 text-foreground">
		<ul className="grid grid-cols-4 gap-7">
			{cards.map((card) => (
				<li key={card.projectPath} aria-label={card.label}>
					<ProjectThumbnail
						path={raw}
						projectPath={card.projectPath}
						composed={card.composed}
						revision={1}
					/>
					<p className="mt-3 text-sm font-medium">{card.label}</p>
				</li>
			))}
		</ul>
	</main>,
);
