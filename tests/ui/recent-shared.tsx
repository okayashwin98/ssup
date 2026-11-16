/* Mock share service: the Home row and the preview after sharing. No network leaves the page. */
import { createRoot } from "react-dom/client";
import { PublishedVideoPreview } from "@/components/video-editor/cloud/PublishedVideoPreview";
import { RecentSharedVideos } from "@/components/video-editor/dashboard/RecentSharedVideos";
import "@/index.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle("dark", theme === "dark");
const endpoint = "https://share.example.test/api/upload";
const titles = [
	"Product walkthrough",
	"Bug repro: export stalls",
	"Onboarding draft",
	"Weekly update",
	"Design review notes",
	"Pricing page tour",
	"Release checklist",
];
let reads = 0;
window.electronAPI = {
	openExternalUrl: async (url: string) => {
		document.documentElement.dataset.opened = url;
		return { success: true };
	},
	cloudShareManage: async (input: { action: string; token: string; endpoint: string }) => {
		reads++;
		document.documentElement.dataset.reads = String(reads);
		document.documentElement.dataset.request = `${input.action}:${input.token}:${input.endpoint}`;
		if (params.has("fails")) return { success: false, error: "Network unreachable" };
		if (params.has("empty")) return { success: true, videos: [] };
		return {
			success: true,
			videos: [
				...titles.map((title, index) => ({
					code: `demo${index + 1}`,
					title,
					url: `https://share.example.test/s/demo${index + 1}`,
					ready: true,
					size: 1,
					createdAt: new Date(Date.UTC(2026, 10, 15 - index)).toISOString(),
				})),
				// Still uploading: never listed.
				{
					code: "pending",
					title: "Unfinished upload",
					url: "https://share.example.test/s/pending",
					ready: false,
					size: 1,
					createdAt: new Date(Date.UTC(2026, 10, 16)).toISOString(),
				},
			],
		};
	},
} as unknown as typeof window.electronAPI;

createRoot(document.getElementById("root")!).render(
	<main className="min-h-screen bg-background px-10 pt-7 text-foreground">
		{params.has("preview") ? (
			<div className="max-w-md">
				<PublishedVideoPreview url="https://share.example.test/s/demo1" />
			</div>
		) : (
			<>
				<RecentSharedVideos
					token="fixture-key"
					endpoint={endpoint}
					onViewAll={() => {
						document.documentElement.dataset.viewAll = "true";
					}}
				/>
				<p className="text-sm text-muted-foreground">(project grid)</p>
			</>
		)}
	</main>,
);
