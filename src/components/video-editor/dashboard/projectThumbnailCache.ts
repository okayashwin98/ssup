// Finished-edit previews rendered on Home: reused across cards and remounts, rendered one at a
// time so scrolling never starts many video decoders at once.
const completed = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
const MAX_ENTRIES = 100;

export function peekProjectThumbnail(key: string) {
	return completed.get(key);
}

export function getOrCreateProjectThumbnail(
	key: string,
	create: () => Promise<string>,
): Promise<string> {
	const cached = completed.get(key);
	if (cached) {
		completed.delete(key);
		completed.set(key, cached);
		return Promise.resolve(cached);
	}
	const existing = pending.get(key);
	if (existing) return existing;
	const task = queue
		.then(create)
		.then((url) => {
			completed.set(key, url);
			if (completed.size > MAX_ENTRIES) completed.delete(completed.keys().next().value!);
			return url;
		})
		.finally(() => pending.delete(key));
	pending.set(key, task);
	queue = task.catch(() => undefined);
	return task;
}
