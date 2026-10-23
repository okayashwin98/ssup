import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {} }));

const { buildShareCardHtml } = await import("./shareCard");

const base = { poster: Buffer.from("poster"), font: Buffer.from("font") };

describe("buildShareCardHtml", () => {
	it("escapes the title so it can't add markup to the card", () => {
		const html = buildShareCardHtml({ ...base, title: `<script>alert("x")</script> & co` });
		expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
		expect(html).not.toContain(`<script>alert`);
	});

	it("uses only image data URLs for the photo, else the name's initial", () => {
		const photo = "data:image/jpeg;base64,AAAA";
		expect(buildShareCardHtml({ ...base, title: "t", avatarDataUrl: photo })).toContain(
			`<img class="avatar" src="${photo}"`,
		);
		const fallback = buildShareCardHtml({
			...base,
			title: "t",
			avatarDataUrl: `javascript:alert(1)`,
			name: "jane",
		});
		expect(fallback).not.toContain("javascript:");
		expect(fallback).toContain(`<div class="avatar initial">J</div>`);
		expect(buildShareCardHtml({ ...base, title: "t" })).not.toContain(`class="avatar`);
	});
});
