import { type RefObject, useLayoutEffect } from "react";

/** Keeps a bar window exactly the size of its bar. */
export function useBarWindowSize(ref: RefObject<HTMLElement | null>) {
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const report = () => {
			const { width, height } = node.getBoundingClientRect();
			if (width > 0 && height > 0) {
				window.electronAPI?.hudWindowSetContentSize?.({
					width: Math.ceil(width),
					height: Math.ceil(height),
				});
			}
		};
		report();
		const observer = new ResizeObserver(report);
		observer.observe(node);
		return () => observer.disconnect();
	}, [ref]);
}
