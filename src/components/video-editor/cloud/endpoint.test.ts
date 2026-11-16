import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEndpoint(env: Record<string, string>) {
	vi.resetModules();
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	return import("./endpoint");
}

describe("personal cloud share token", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("uses the personal password, trimmed", async () => {
		const { CLOUD_SHARE_PERSONAL_TOKEN } = await loadEndpoint({
			VITE_CLOUD_SHARE_SECRET: " personal-secret ",
		});
		expect(CLOUD_SHARE_PERSONAL_TOKEN).toBe("personal-secret");
	});

	it("has no token when the password is empty", async () => {
		const { CLOUD_SHARE_PERSONAL_TOKEN } = await loadEndpoint({ VITE_CLOUD_SHARE_SECRET: " " });
		expect(CLOUD_SHARE_PERSONAL_TOKEN).toBeUndefined();
	});
});
