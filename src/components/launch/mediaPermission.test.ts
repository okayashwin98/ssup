import { describe, expect, it, vi } from "vitest";
import {
	createMediaPermissionTracker,
	isMediaAllowed,
	type MediaPermissionStatus,
	needsSystemSettings,
} from "./mediaPermission";

function setup(initial: string, answer = true) {
	let camera = initial;
	const api = {
		getMediaPermissionStatus: vi.fn(async () => ({
			success: true,
			camera,
			microphone: "granted",
		})),
		requestMediaPermission: vi.fn(async () => {
			camera = answer ? "granted" : "denied";
			return { success: true, granted: answer };
		}),
	};
	const seen: MediaPermissionStatus[] = [];
	const tracker = createMediaPermissionTracker("camera", api, (status) => seen.push(status));
	const change = (next: string) => {
		camera = next;
	};
	return { api, tracker, seen, change };
}

describe("camera access tracker", () => {
	it.each([
		["not-determined", false, false],
		["granted", true, false],
		["denied", false, true],
		["restricted", false, true],
	] as const)("reads %s without prompting", async (status, allowed, settings) => {
		const { api, tracker } = setup(status);
		const result = await tracker.refresh();
		expect(result).toBe(status);
		expect(isMediaAllowed(result)).toBe(allowed);
		expect(needsSystemSettings(result)).toBe(settings);
		expect(api.requestMediaPermission).not.toHaveBeenCalled();
	});

	it("prompts once while undecided, even when turned on twice at the same time", async () => {
		const { api, tracker } = setup("not-determined");
		const [first, second] = await Promise.all([tracker.request(), tracker.request()]);
		expect(first).toBe("granted");
		expect(second).toBe("granted");
		expect(api.requestMediaPermission).toHaveBeenCalledTimes(1);
		expect(await tracker.request()).toBe("granted");
		expect(api.requestMediaPermission).toHaveBeenCalledTimes(1);
	});

	it("reports a refused prompt as denied and never prompts again", async () => {
		const { api, tracker } = setup("not-determined", false);
		expect(await tracker.request()).toBe("denied");
		expect(await tracker.request()).toBe("denied");
		expect(api.requestMediaPermission).toHaveBeenCalledTimes(1);
	});

	it.each([
		"granted",
		"denied",
		"restricted",
	])("does not prompt when access is already %s", async (status) => {
		const { api, tracker } = setup(status);
		expect(await tracker.request()).toBe(status);
		expect(api.requestMediaPermission).not.toHaveBeenCalled();
	});

	it("picks up access turned on in System Settings on the next read", async () => {
		const { tracker, change, seen } = setup("denied");
		await tracker.refresh();
		change("granted");
		await tracker.refresh();
		expect(seen).toEqual(["denied", "granted"]);
	});

	it("treats an unreadable status as unknown, neither allowed nor sent to Settings", async () => {
		const api = {
			getMediaPermissionStatus: vi.fn(async () => ({
				success: false,
				camera: "unknown",
				microphone: "unknown",
			})),
			requestMediaPermission: vi.fn(),
		};
		const tracker = createMediaPermissionTracker("camera", api, () => undefined);
		const result = await tracker.request();
		expect(result).toBe("unknown");
		expect(isMediaAllowed(result)).toBe(false);
		expect(needsSystemSettings(result)).toBe(false);
		expect(api.requestMediaPermission).not.toHaveBeenCalled();
	});

	it("stops reporting after it is disposed", async () => {
		const { tracker, seen } = setup("granted");
		tracker.dispose();
		await tracker.refresh();
		expect(seen).toEqual([]);
	});
});
