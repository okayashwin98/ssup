import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { afterEach, beforeEach, expect, it } from "vitest";
import { encodeComposedThumbnail, hasCurrentComposedThumbnail } from "./composedThumbnail";

function chunk(type: string, data: Buffer) {
	const out = Buffer.alloc(data.length + 12);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4);
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
	return out;
}

function png(width: number, height: number) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const rows = Buffer.alloc((width * 3 + 1) * height);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;
let dir: string;
beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "supershare-composed-"));
});
afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true });
});

it("marks a card-sized PNG without breaking it, and rejects other sizes or formats", () => {
	const marked = encodeComposedThumbnail(dataUrl(png(640, 480)));
	// Every chunk still carries a valid checksum and the image data is untouched.
	let offset = 8;
	const types: string[] = [];
	while (offset < marked.length) {
		const length = marked.readUInt32BE(offset);
		const body = marked.subarray(offset + 4, offset + 8 + length);
		expect(marked.readUInt32BE(offset + 8 + length)).toBe(crc32(body));
		types.push(body.toString("ascii", 0, 4));
		if (types.at(-1) === "IDAT") expect(inflateSync(body.subarray(4)).length).toBe(1921 * 480);
		offset += length + 12;
	}
	expect(types).toEqual(["IHDR", "tEXt", "IDAT", "IEND"]);
	expect(() => encodeComposedThumbnail(dataUrl(png(320, 240)))).toThrow();
	expect(() => encodeComposedThumbnail("data:image/jpeg;base64,AAAA")).toThrow();
});

it("accepts only a marked preview that is at least as new as the project", async () => {
	const file = path.join(dir, "preview.png");
	expect(await hasCurrentComposedThumbnail(file, 0)).toBe(false);
	await fs.writeFile(file, png(640, 480));
	expect(await hasCurrentComposedThumbnail(file, 0)).toBe(false);
	await fs.writeFile(file, encodeComposedThumbnail(dataUrl(png(640, 480))));
	expect(await hasCurrentComposedThumbnail(file, 0)).toBe(true);
	expect(await hasCurrentComposedThumbnail(file, Date.now() + 10000)).toBe(false);
});
