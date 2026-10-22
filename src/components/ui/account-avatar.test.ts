import { expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { getAccountProfile } from "./account-avatar";
it("uses OAuth profile photos and falls back to name or email initials", () => {
	const user = {
		email: "alex@example.com",
		user_metadata: { full_name: "Alex Smith", avatar_url: "https://example.com/photo.jpg" },
	} as User;
	expect(getAccountProfile(user)).toEqual({
		name: "Alex Smith",
		initials: "AS",
		picture: "https://example.com/photo.jpg",
	});
	expect(
		getAccountProfile({ ...user, user_metadata: { picture: "https://example.com/google.jpg" } })
			.picture,
	).toBe("https://example.com/google.jpg");
	expect(getAccountProfile({ ...user, user_metadata: {} })).toEqual({
		name: "alex@example.com",
		initials: "A",
		picture: undefined,
	});
	vi.stubEnv("VITE_PROFILE_NAME", "");
	expect(getAccountProfile(null).initials).toBe("LP");
	vi.unstubAllEnvs();
});

it("names the local profile from the build setting when no one is signed in", () => {
	vi.stubEnv("VITE_PROFILE_NAME", "Jane Doe");
	expect(getAccountProfile(null)).toMatchObject({ name: "Jane Doe", initials: "JD" });
	expect(
		getAccountProfile({ email: "alex@example.com", user_metadata: {} } as User).initials,
	).toBe("A");
	vi.unstubAllEnvs();
});
