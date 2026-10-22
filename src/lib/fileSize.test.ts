import { expect, it } from "vitest";
import { formatFileSize } from "./fileSize";

it("formats recording sizes for library cards", () => {
	expect(formatFileSize(undefined)).toBeNull();
	expect(formatFileSize(0)).toBeNull();
	expect(formatFileSize(300)).toBe("1 KB");
	expect(formatFileSize(110_703)).toBe("108 KB");
	expect(formatFileSize(2_897_866)).toBe("2.8 MB");
	expect(formatFileSize(250 * 1024 * 1024)).toBe("250 MB");
	expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
});
