// Adapted from Voom (MIT), Copyright (c) 2026 Aritro Paul.
// See ../../LICENSE and ../../../../THIRD_PARTY_NOTICES.md for attribution.

export const EXPIRY_DAYS = 30;
// Hosted accounts use the free policy until server-verified paid entitlements exist.
export const FREE_EXPIRY_DAYS = 14;
// Personal deployments can set KEEP_RECORDINGS=true to keep recordings until the owner deletes them.
export const NEVER_EXPIRES_AT = "9999-12-31T23:59:59.000Z";

export function recordingExpiresAt(env, days = EXPIRY_DAYS) {
	if (env.KEEP_RECORDINGS === "true") return NEVER_EXPIRES_AT;
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function finiteNonnegative(value) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : 0;
}
