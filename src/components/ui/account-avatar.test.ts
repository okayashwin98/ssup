import { expect, it, vi } from "vitest";
import { getAccountProfile } from "./account-avatar";

it("names the profile from the label, then the local profile, then the build setting", () => {
	vi.stubEnv("VITE_PROFILE_NAME", "Jane Doe");
	expect(getAccountProfile()).toMatchObject({ name: "Jane Doe", initials: "JD" });
	expect(
		getAccountProfile(undefined, { name: "Alex Smith", avatarDataUrl: "data:image/jpeg;x" }),
	).toEqual({ name: "Alex Smith", initials: "AS", picture: "data:image/jpeg;x" });
	expect(getAccountProfile("Sam Lee", { name: "Alex Smith", avatarDataUrl: null }).initials).toBe(
		"SL",
	);
	vi.stubEnv("VITE_PROFILE_NAME", "");
	expect(getAccountProfile().initials).toBe("LP");
	vi.unstubAllEnvs();
});
