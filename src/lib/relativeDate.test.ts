import { describe, expect, it } from "vitest";
import { formatDuration, formatRelativeDate } from "./relativeDate";

// Thursday 23 Oct 2026, 14:00 local time.
const now = new Date(2026, 9, 23, 14, 0, 0).getTime();
const at = (day: number, hour: number, minute = 0, year = 2026, month = 9) =>
	new Date(year, month, day, hour, minute).getTime();

describe("formatRelativeDate", () => {
	it("uses short relative times on the same day", () => {
		expect(formatRelativeDate(now - 20_000, now)).toBe("Now");
		expect(formatRelativeDate(now - 60_000, now)).toBe("1m ago");
		expect(formatRelativeDate(now - 59 * 60_000, now)).toBe("59m ago");
		expect(formatRelativeDate(at(23, 13, 0), now)).toBe("1h ago");
		expect(formatRelativeDate(at(23, 6, 0), now)).toBe("8h ago");
	});

	it("switches to Yesterday, then weekdays, then dates", () => {
		expect(formatRelativeDate(at(22, 23, 30), now)).toBe("Yesterday");
		expect(formatRelativeDate(at(20, 9), now)).toBe(
			new Date(at(20, 9)).toLocaleDateString(undefined, { weekday: "long" }),
		);
		expect(formatRelativeDate(at(16, 9), now)).toBe(
			new Date(at(16, 9)).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
		);
		expect(formatRelativeDate(at(11, 9, 0, 2025), now)).toContain("2025");
	});
});

describe("formatDuration", () => {
	it("formats minutes and hours", () => {
		expect(formatDuration(undefined)).toBeNull();
		expect(formatDuration(0)).toBeNull();
		expect(formatDuration(57_000)).toBe("0:57");
		expect(formatDuration(14_111)).toBe("0:14");
		expect(formatDuration(3_725_000)).toBe("1:02:05");
	});
});
