import { subscribeShareCapacityChanges } from "../cloud/shareCapacity";
import { parseSharedRecordingDate } from "../cloud/sharedRecordingDate";

export type SharedVideo = {
	code: string;
	title: string;
	url: string;
	ready: boolean;
	createdAt?: string;
};
type Snapshot = { videos?: SharedVideo[]; expiresAt: number; pending?: Promise<SharedVideo[]> };
const snapshots = new Map<string, Snapshot>();
const FRESH_MS = 60_000;
export const RECENT_SHARED_LIMIT = 12;

/** The last list seen for this share service, so Home reopens without the row jumping in. */
export function peekRecentSharedVideos(endpoint: string) {
	return snapshots.get(endpoint)?.videos;
}

/** Newest finished uploads first; reads within a minute reuse the last answer unless `fresh`. */
export function readRecentSharedVideos(
	endpoint: string,
	token: string,
	fresh = false,
): Promise<SharedVideo[]> {
	const existing = snapshots.get(endpoint);
	if (existing?.pending && !fresh) return existing.pending;
	if (!fresh && existing?.videos && existing.expiresAt > Date.now())
		return Promise.resolve(existing.videos);
	const snapshot: Snapshot = { videos: existing?.videos, expiresAt: existing?.expiresAt ?? 0 };
	snapshots.set(endpoint, snapshot);
	snapshot.pending = Promise.resolve().then(async () => {
		try {
			const result = await window.electronAPI.cloudShareManage({
				token,
				endpoint,
				action: "list",
			});
			if (!result.success) throw new Error(result.error || "Could not load shared videos.");
			const videos = ((result.videos ?? []) as SharedVideo[])
				.filter((video) => video.ready)
				.sort(
					(a, b) =>
						parseSharedRecordingDate(b.createdAt) -
						parseSharedRecordingDate(a.createdAt),
				)
				.slice(0, RECENT_SHARED_LIMIT);
			snapshot.videos = videos;
			snapshot.expiresAt = Date.now() + FRESH_MS;
			return videos;
		} finally {
			snapshot.pending = undefined;
		}
	});
	return snapshot.pending;
}

// A share, rename or delete anywhere in the app makes the next read go to the service.
subscribeShareCapacityChanges(() => {
	for (const snapshot of snapshots.values()) snapshot.expiresAt = 0;
});
