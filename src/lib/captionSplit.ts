/** Netflix's line length: longer captions are cut into pieces that each show on their own. */
export const MAX_CAPTION_CHARS = 42;

export type SplitCaptionWord = {
	text: string;
	startMs: number;
	endMs: number;
	leadingSpace?: boolean;
};

export type SplitCaptionCue = {
	startMs: number;
	endMs: number;
	text: string;
	words?: SplitCaptionWord[];
};

/**
 * Groups items, joined by single spaces, into the fewest pieces that fit the limit, as even
 * in length as possible (least squared difference from the average), so no piece is left
 * with a stray word.
 */
function splitEvenly<T>(items: T[], itemLength: (item: T) => number): T[][] {
	// prefix[i]: combined length of the first i items; a piece also counts its spaces.
	const prefix = [0];
	for (const item of items) prefix.push(prefix[prefix.length - 1] + itemLength(item));
	const size = (start: number, end: number) => prefix[end] - prefix[start] + (end - start - 1);
	const total = size(0, items.length);
	for (let pieces = Math.ceil(total / MAX_CAPTION_CHARS); pieces <= items.length; pieces++) {
		if (pieces <= 1) return [items];
		const target = total / pieces;
		// best[k][i]: lowest cost for the first i items in k pieces; cut[k][i]: where the last piece starts.
		const best = Array.from({ length: pieces + 1 }, () =>
			Array(items.length + 1).fill(Infinity),
		);
		const cut = Array.from({ length: pieces + 1 }, () => Array(items.length + 1).fill(0));
		best[0][0] = 0;
		for (let k = 1; k <= pieces; k++) {
			for (let i = k; i <= items.length; i++) {
				// Walk back from i; pieces only grow, so stop once one is too long.
				for (let start = i - 1; start >= k - 1; start--) {
					const length = size(start, i);
					// A single word longer than the limit still gets its own piece.
					if (length > MAX_CAPTION_CHARS && i - start > 1) break;
					if (best[k - 1][start] === Infinity) continue;
					const cost = best[k - 1][start] + (length - target) ** 2;
					if (cost < best[k][i]) {
						best[k][i] = cost;
						cut[k][i] = start;
					}
				}
			}
		}
		if (best[pieces][items.length] === Infinity) continue;
		const groups: T[][] = [];
		for (let k = pieces, end = items.length; k > 0; k--) {
			const start = cut[k][end];
			groups.unshift(items.slice(start, end));
			end = start;
		}
		return groups;
	}
	return items.map((item) => [item]);
}

/**
 * Cuts a long cue at word starts. With word timing each piece shows from its first word
 * until the next piece starts; without it the cue's time is shared out by text length.
 */
export function splitLongCue<T extends SplitCaptionCue>(cue: T): SplitCaptionCue[] {
	const tokens = cue.words ?? [];
	if (tokens.length === 0) {
		const groups = splitEvenly(cue.text.trim().split(/\s+/), (word) => word.length);
		const texts = groups.map((group) => group.join(" "));
		const total = texts.reduce((sum, text) => sum + text.length, 0) || 1;
		let cursor = cue.startMs;
		return texts.map((text, index) => {
			const startMs = cursor;
			cursor =
				index === texts.length - 1
					? cue.endMs
					: Math.round(startMs + ((cue.endMs - cue.startMs) * text.length) / total);
			return { startMs, endMs: cursor, text };
		});
	}
	// Whisper splits some words into several tokens; only break where a space starts a word.
	const words: SplitCaptionWord[][] = [];
	tokens.forEach((token, index) => {
		if (index === 0 || token.leadingSpace) words.push([token]);
		else words[words.length - 1].push(token);
	});
	const textOf = (group: SplitCaptionWord[][]) =>
		group
			.map((word) => word.map((token) => token.text).join(""))
			.join(" ")
			.trim();
	const groups = splitEvenly(words, (word) => textOf([word]).length);
	return groups.map((group, index) => ({
		startMs: index === 0 ? cue.startMs : group[0][0].startMs,
		endMs: index === groups.length - 1 ? cue.endMs : groups[index + 1][0][0].startMs,
		text: textOf(group),
	}));
}
