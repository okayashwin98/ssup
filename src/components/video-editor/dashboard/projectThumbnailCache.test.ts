import { expect, it } from "vitest";
import { getOrCreateProjectThumbnail, peekProjectThumbnail } from "./projectThumbnailCache";

it("renders one preview at a time, shares a pending render and keeps going after a failure", async () => {
	let running = 0;
	let most = 0;
	let calls = 0;
	const slow =
		(url: string, fail = false) =>
		async () => {
			calls++;
			running++;
			most = Math.max(most, running);
			await new Promise((resolve) => setTimeout(resolve, 10));
			running--;
			if (fail) throw new Error("render failed");
			return url;
		};
	const first = getOrCreateProjectThumbnail("a", slow("data:a"));
	const again = getOrCreateProjectThumbnail("a", slow("data:other"));
	const broken = getOrCreateProjectThumbnail("b", slow("data:b", true));
	const last = getOrCreateProjectThumbnail("c", slow("data:c"));
	expect(again).toBe(first);
	await expect(first).resolves.toBe("data:a");
	await expect(broken).rejects.toThrow("render failed");
	await expect(last).resolves.toBe("data:c");
	expect(most).toBe(1);
	expect(calls).toBe(3);
	expect(peekProjectThumbnail("a")).toBe("data:a");
	expect(peekProjectThumbnail("b")).toBeUndefined();
});
