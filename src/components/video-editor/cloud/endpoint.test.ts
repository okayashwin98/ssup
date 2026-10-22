import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEndpoint(env: Record<string, string>) {
	vi.resetModules();
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	return import("./endpoint");
}

describe("personal cloud share token", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("uses the personal password when Supabase sign-in is not configured", async () => {
		const { CLOUD_SHARE_PERSONAL_TOKEN } = await loadEndpoint({
			VITE_SUPABASE_URL: "",
			VITE_SUPABASE_PUBLISHABLE_KEY: "",
			VITE_CLOUD_SHARE_SECRET: " personal-secret ",
		});
		expect(CLOUD_SHARE_PERSONAL_TOKEN).toBe("personal-secret");
	});

	it("ignores the personal password when Supabase sign-in is configured", async () => {
		const { CLOUD_SHARE_PERSONAL_TOKEN } = await loadEndpoint({
			VITE_SUPABASE_URL: "https://auth.recordly.test",
			VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
			VITE_CLOUD_SHARE_SECRET: "personal-secret",
		});
		expect(CLOUD_SHARE_PERSONAL_TOKEN).toBeUndefined();
	});
});
