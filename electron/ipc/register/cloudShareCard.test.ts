import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getPath: () => "/tmp" },
	ipcMain: { handle: vi.fn() },
	shell: {},
}));
vi.mock("../recording/shareCard", () => ({
	// The first render is slower, as when a rename follows quickly.
	renderShareCard: vi.fn(async ({ title }: { title: string }) => {
		await new Promise((resolve) => setTimeout(resolve, title === "A" ? 60 : 5));
		return Buffer.from(title);
	}),
}));
vi.mock("node:fs/promises", async (original) => {
	const actual = await original<typeof import("node:fs/promises")>();
	return { ...actual, default: { ...actual, readFile: vi.fn(async () => Buffer.from("font")) } };
});

const { refreshShareCard } = await import("./cloudShare");

afterEach(() => vi.unstubAllGlobals());

describe("refreshShareCard", () => {
	it("uploads only the newest title's preview when renames overlap", async () => {
		const uploads: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: URL, init?: RequestInit) => {
				if (String(url).includes("/thumb/")) return new Response(new Uint8Array([1]));
				uploads.push(Buffer.from(init?.body as Uint8Array).toString());
				return new Response("{}");
			}),
		);
		await Promise.all([
			refreshShareCard("http://localhost", "abc", "t", "A", {}),
			refreshShareCard("http://localhost", "abc", "t", "B", {}),
		]);
		expect(uploads).toEqual(["B"]);
	});
});
