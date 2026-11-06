import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {} }));

const { buildShareCardHtml } = await import("./shareCard");

describe("buildShareCardHtml", () => {
	it("shows only the whole video frame and a play button", () => {
		const html = buildShareCardHtml({ poster: Buffer.from("poster") });
		expect(html).toContain(
			`src="data:image/jpeg;base64,${Buffer.from("poster").toString("base64")}"`,
		);
		expect(html).toContain(`<div class="play">`);
		expect(html).toContain(`<img class="poster"`);
		expect(html).not.toMatch(/class="(avatar|title|fade)"/);
	});
});
