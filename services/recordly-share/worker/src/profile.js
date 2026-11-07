import { errorResponse, jsonResponse } from "./http.js";

const PROFILE_KEY = "profile/profile.json";
const AVATAR_KEY = "profile/avatar";
const MAX_AVATAR_BYTES = 400_000;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Owner's public name and photo, set from the desktop app; falls back to CREATOR_NAME. */
export async function getCreatorProfile(env) {
	const stored = await env.VIDEOS_BUCKET.get(PROFILE_KEY);
	const profile = stored ? await stored.json().catch(() => null) : null;
	const name =
		(typeof profile?.name === "string" && profile.name.trim()) ||
		(typeof env.CREATOR_NAME === "string" && env.CREATOR_NAME.trim()) ||
		"";
	if (!name && !profile?.avatarUpdatedAt) return null;
	return {
		name: name.slice(0, 100),
		bio: typeof env.CREATOR_BIO === "string" ? env.CREATOR_BIO.trim().slice(0, 200) : null,
		website:
			typeof env.CREATOR_WEBSITE === "string" && /^https?:\/\//i.test(env.CREATOR_WEBSITE)
				? env.CREATOR_WEBSITE
				: null,
		avatarUrl: profile?.avatarUpdatedAt ? `/profile/avatar?v=${profile.avatarUpdatedAt}` : null,
	};
}

export async function handleProfileUpdate(request, env) {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") return errorResponse("Invalid profile");
	const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
	let avatarUpdatedAt = null;
	if (typeof body.avatarDataUrl === "string") {
		const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(body.avatarDataUrl);
		if (!match || !AVATAR_TYPES.has(match[1])) return errorResponse("Unsupported photo format");
		const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
		if (bytes.byteLength > MAX_AVATAR_BYTES) return errorResponse("Photo is too large", 413);
		await env.VIDEOS_BUCKET.put(AVATAR_KEY, bytes, { httpMetadata: { contentType: match[1] } });
		avatarUpdatedAt = Date.now();
	} else {
		await env.VIDEOS_BUCKET.delete(AVATAR_KEY);
	}
	await env.VIDEOS_BUCKET.put(PROFILE_KEY, JSON.stringify({ name, avatarUpdatedAt }), {
		httpMetadata: { contentType: "application/json" },
	});
	return jsonResponse({ ok: true, avatarUpdatedAt });
}

/** The browser-tab icon: the owner's photo cut to a circle, or the app icon until one is set. */
export async function handleFavicon(request, env) {
	const avatar = await env.VIDEOS_BUCKET.get(AVATAR_KEY);
	if (!avatar)
		return env.ASSETS.fetch(new Request(new URL("/icon-64.png", request.url), request));
	const bytes = new Uint8Array(await avatar.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	const photo = `data:${avatar.httpMetadata?.contentType || "image/jpeg"};base64,${btoa(binary)}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath><image href="${photo}" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/></svg>`;
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml",
			// One address for every photo, so browsers check back within the hour.
			"Cache-Control": "public, max-age=3600",
		},
	});
}

export async function handleProfileAvatar(env) {
	const avatar = await env.VIDEOS_BUCKET.get(AVATAR_KEY);
	if (!avatar) return new Response("Not found", { status: 404 });
	return new Response(avatar.body, {
		headers: {
			"Content-Type": avatar.httpMetadata?.contentType || "image/jpeg",
			// The URL carries a version, so a new photo is a new address.
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
