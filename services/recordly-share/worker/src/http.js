// Adapted from Voom (MIT), Copyright (c) 2026 Aritro Paul.
// See ../../LICENSE and ../../../../THIRD_PARTY_NOTICES.md for attribution.

export function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function errorResponse(message, status = 400) {
	return jsonResponse({ error: message }, status);
}

export function parseCookies(cookieStr) {
	const cookies = {};
	cookieStr.split(";").forEach((c) => {
		const [key, ...val] = c.trim().split("=");
		if (key) cookies[key] = val.join("=");
	});
	return cookies;
}

/** Reads a stored date. New rows keep the "Z" (UTC) suffix; older SQLite-style ones have none. */
export function parseStoredDate(value) {
	const text = String(value ?? "");
	return new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text.replace(" ", "T")}Z`);
}

/** True once a stored expiry date has passed. An unreadable date counts as not expired. */
export function isPastDate(value) {
	const date = parseStoredDate(value);
	return !Number.isNaN(date.getTime()) && date < new Date();
}
