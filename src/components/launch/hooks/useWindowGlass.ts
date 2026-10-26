import { useState } from "react";

/**
 * Whether this bar's window sits on Apple's Liquid Glass. Asked once, before the first
 * paint, so a bar on glass never flashes its own frosted fill and edge.
 */
export function useWindowGlass(): boolean {
	const [glass] = useState(() => {
		try {
			return window.electronAPI?.hudWindowHasGlass?.() === true;
		} catch {
			return false;
		}
	});
	return glass;
}
