type HudMenuRequest = Parameters<typeof window.electronAPI.hudShowMenu>[0];

/**
 * Shows a bar or picker menu. While it is open, a press in this window only closes it,
 * as with macOS's own menus: clicking the button again doesn't reopen it.
 */
export async function showHudMenu(request: HudMenuRequest): Promise<string | null> {
	let swallowClick: ((event: MouseEvent) => void) | null = null;
	const onPointerDown = () => {
		window.removeEventListener("pointerdown", onPointerDown, true);
		window.electronAPI.hudCloseMenu?.();
		const swallow = (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};
		swallowClick = swallow;
		window.addEventListener("click", swallow, true);
		// The click follows its release; anything later is a new click.
		window.addEventListener(
			"pointerup",
			() => setTimeout(() => window.removeEventListener("click", swallow, true), 0),
			{ capture: true, once: true },
		);
	};
	window.addEventListener("pointerdown", onPointerDown, true);
	try {
		return await window.electronAPI.hudShowMenu(request);
	} finally {
		window.removeEventListener("pointerdown", onPointerDown, true);
		if (swallowClick) {
			const swallow = swallowClick;
			// A release that never came (a drag out of the window) mustn't leave it behind.
			setTimeout(() => window.removeEventListener("click", swallow, true), 1000);
		}
	}
}
