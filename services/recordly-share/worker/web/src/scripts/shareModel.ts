import type { Comment, Reaction } from "./api";

/** Keep dense timestamp markers usable at every track width. */
function clusterMarkers<T extends { timestamp: number }>(
	comments: T[],
	duration: number,
	width: number,
	pixels = 18,
) {
	const gap = width > 0 ? (pixels / width) * duration : duration * 0.02;
	const clusters: { time: number; members: T[] }[] = [];
	for (const comment of [...comments].sort((a, b) => a.timestamp - b.timestamp)) {
		const last = clusters.at(-1);
		if (last && comment.timestamp - last.members.at(-1)!.timestamp < gap) {
			last.members.push(comment);
			last.time =
				last.members.reduce((sum, item) => sum + item.timestamp, 0) / last.members.length;
		} else clusters.push({ time: comment.timestamp, members: [comment] });
	}
	return clusters;
}

/** Parse inline timestamps without converting user text to HTML. */
export function timestampParts(text: string, duration: number) {
	const pattern = /(?<!\d)(?:(\d+):)?([0-5]?\d):([0-5]\d)(?!\d)/g;
	const parts: { text: string; time?: number }[] = [];
	let start = 0;
	for (const match of text.matchAll(pattern)) {
		const index = match.index!;
		if (index > start) parts.push({ text: text.slice(start, index) });
		const time = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
		parts.push({ text: match[0], ...(duration > 0 && time <= duration ? { time } : {}) });
		start = index + match[0].length;
	}
	if (start < text.length) parts.push({ text: text.slice(start) });
	return parts;
}

export const clusterComments = (items: Comment[], duration: number, width: number) =>
	clusterMarkers(items, duration, width);
export const clusterReactions = (items: Reaction[], duration: number, width: number) =>
	clusterMarkers(items, duration, width, 32);

export interface TimelineItem {
	timestamp: number;
	kind: "comment" | "reaction" | "chapter";
	label: string;
	emoji?: string;
}
export const clusterTimeline = (items: TimelineItem[], duration: number, width: number) =>
	clusterMarkers(items, duration, width, 28);

// One part of an emoji: a pictograph, optionally with the emoji selector and a skin tone.
const EMOJI_PART = "\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?";
const EMOJI_SHAPES = [
	// One part, or several joined into one (families, professions, 🏳️‍🌈).
	new RegExp(`^${EMOJI_PART}(?:\\u200D${EMOJI_PART})*$`, "u"),
	// Country flags.
	/^\p{Regional_Indicator}{2}$/u,
	// Keycaps: digits, # and * count only with the keycap mark.
	/^[0-9#*]\uFE0F?\u20E3$/u,
	// Region flags (England, Scotland, Wales).
	/^\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}$/u,
];
// Symbols that are text by default (©, ⚠, ☝) count only when marked as emoji.
const SHOWN_AS_EMOJI = /\p{Emoji_Presentation}|\uFE0F|\p{Emoji_Modifier}|\u20E3/u;

/** True for exactly one emoji. The server applies the same rule (worker/src/feedback.js). */
export const isSingleEmoji = (value: string) =>
	value.length > 0 &&
	new TextEncoder().encode(value).length <= 64 &&
	SHOWN_AS_EMOJI.test(value) &&
	EMOJI_SHAPES.some((shape) => shape.test(value));
