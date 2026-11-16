/* Mock bridge: Home's storage box and "Free up space" with made-up recordings. Nothing on disk is touched. */
import { createRoot } from "react-dom/client";
import { StorageCard } from "@/components/video-editor/dashboard/StorageCard";
import type { UnusedRecording } from "@/types/recordingLibrary";
import "@/index.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle("dark", theme === "dark");
const dir = "/Users/demo/Movies/SuperShare";
const group = (stamp: number, mb: number, folder?: string, extra: string[] = []) => {
	const base = `${folder ? `${dir}/${folder}` : dir}/recording-${stamp}`;
	const files = [`${base}.mp4`, ...extra.map((suffix) => `${base}${suffix}`)].map(
		(path, index) => ({ path, bytes: index ? 4_000_000 : mb * 1_000_000 }),
	);
	return {
		path: files[0].path,
		name: `recording-${stamp}.mp4`,
		...(folder ? { folder } : {}),
		files,
		bytes: files.reduce((sum, file) => sum + file.bytes, 0),
		modifiedAt: stamp,
	} satisfies UnusedRecording;
};
const unused: UnusedRecording[] = params.has("empty")
	? []
	: [
			group(Date.UTC(2026, 10, 12, 9, 41), 812, undefined, [
				".mp4.cursor.json",
				".mic.wav",
				"-webcam.mp4",
			]),
			group(Date.UTC(2026, 10, 10, 16, 5), 1_460, "Pricing page tour", [
				".mp4.cursor.json",
				".mic.wav",
			]),
			group(Date.UTC(2026, 10, 3, 11, 20), 96, undefined, [".mp4.cursor.json"]),
			group(Date.UTC(2026, 9, 28, 14, 52), 2_310, "Onboarding draft", [
				".mp4.cursor.json",
				".system.wav",
				".mic.wav",
			]),
		];
const requests: string[][] = [];
window.electronAPI = {
	getLocalStorageUsage: async () => ({
		success: true,
		bytes: requests.length ? 3_100_000_000 : 7_840_000_000,
	}),
	getRecordingThumbnail: async () => ({
		success: true,
		value: "/tests/ui/fixtures/recording-thumbnail.jpg",
	}),
	findUnusedRecordings: async () =>
		params.has("busy")
			? { success: false, error: "Finish or stop the recording first, then try again." }
			: { success: true, value: unused },
	trashUnusedRecordings: async (paths: string[]) => {
		requests.push(paths);
		document.documentElement.dataset.trashed = JSON.stringify(paths);
		// The last one was picked up by a project in the meantime, so it stays.
		const kept = paths.filter((path) => path === unused[3]?.path);
		const moved = unused.filter(
			(entry) => paths.includes(entry.path) && !kept.includes(entry.path),
		);
		return {
			success: true,
			value: {
				trashed: moved.flatMap((entry) => entry.files.map((file) => file.path)),
				kept,
				failed: [],
				bytes: moved.reduce((sum, entry) => sum + entry.bytes, 0),
			},
		};
	},
} as unknown as typeof window.electronAPI;

createRoot(document.getElementById("root")!).render(
	<main className="dashboard-surface min-h-screen bg-background p-6 text-foreground">
		<div className="w-56">
			<StorageCard />
		</div>
	</main>,
);
