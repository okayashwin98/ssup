import { expect, it } from "vitest";
import { formatFileSize } from "./fileSize";

it("formats recording sizes for library cards", () => {
	expect(formatFileSize(undefined)).toBeNull();
	expect(formatFileSize(0)).toBeNull();
	expect(formatFileSize(300)).toBe("1 KB");
	expect(formatFileSize(110_703)).toBe("111 KB");
	expect(formatFileSize(2_897_866)).toBe("2.9 MB");
	expect(formatFileSize(250_000_000)).toBe("250 MB");
	expect(formatFileSize(1_500_000_000)).toBe("1.5 GB");
	expect(formatFileSize(10_000_000_000)).toBe("10 GB");
});
