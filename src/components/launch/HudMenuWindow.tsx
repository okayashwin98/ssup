import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./HudMenuWindow.module.css";

// The start bar's and picker's menus, drawn in a floating panel of their own (see
// hudCompactWindows.ts). Positions arrive and leave in screen coordinates.

type MenuRequest = NonNullable<
	Parameters<Parameters<typeof window.electronAPI.onHudMenuOpen>[0]>[0]
>;
type Item = MenuRequest["items"][number];
type Rect = { x: number; y: number; width: number; height: number };
type Layout = {
	origin: { x: number; y: number };
	card: Rect;
	submenus: Record<number, Rect>;
};

// Kept clear of the screen's edges.
const EDGE = 4;
// Room around the card for its shadow, which the window would otherwise cut off.
const SHADOW = { side: 32, top: 24, bottom: 48 };
const SUBMENU_GAP = 4;
// The menu's inner padding, so a side menu's first row lines up with its parent row.
const MENU_PADDING = 6;
// Moving across other rows on the way into a side menu doesn't close it at once.
const SUBMENU_CLOSE_DELAY_MS = 250;

type Nav = { active: number; open: number | null; sub: number; inSub: boolean };
const NO_NAV: Nav = { active: -1, open: null, sub: -1, inSub: false };

const isSelectable = (item: Item) =>
	item.type !== "separator" && item.type !== "header" && item.enabled !== false;

function step(items: Item[], from: number, direction: 1 | -1) {
	for (let offset = 1; offset <= items.length; offset += 1) {
		const index = (from + direction * offset + items.length * offset) % items.length;
		if (isSelectable(items[index])) return index;
	}
	return -1;
}

const firstSelectable = (items: Item[]) => step(items, -1, 1);

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max));
}

function CheckIcon() {
	return (
		<svg
			aria-hidden="true"
			data-slot="menu-item-indicator--checkmark"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			viewBox="0 0 17 18"
		>
			<polyline points="1 9 7 14 15 4" />
		</svg>
	);
}

function ChevronIcon() {
	return (
		<svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
			<path
				d="m6 4 4 4-4 4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			/>
		</svg>
	);
}

function MenuRows({
	items,
	activeIndex,
	openSubmenu,
	rowRefs,
	onHover,
	onPress,
}: {
	items: Item[];
	activeIndex: number;
	openSubmenu?: number | null;
	rowRefs?: { current: (HTMLDivElement | null)[] };
	onHover: (index: number) => void;
	onPress: (index: number) => void;
}) {
	const hasTicks = items.some((item) => item.type === "radio" || item.type === "checkbox");
	return (
		<div className="dropdown__menu p-1.5" role="menu">
			{items.map((item, index) => {
				const key = `${index}:${item.id ?? item.label ?? item.type}`;
				if (item.type === "separator") {
					return (
						<div
							key={key}
							className={`separator ${styles.separator}`}
							data-slot="separator"
							role="separator"
						/>
					);
				}
				if (item.type === "header") {
					return (
						<div
							key={key}
							className={`header ${styles.header} ${hasTicks ? styles.indented : ""}`}
							role="presentation"
						>
							{item.label}
						</div>
					);
				}
				const disabled = item.enabled === false;
				const checkable = item.type === "radio" || item.type === "checkbox";
				return (
					<div
						key={key}
						ref={(node) => {
							if (rowRefs) rowRefs.current[index] = node;
						}}
						className={`menu-item ${hasTicks ? "ps-7 pe-2.5" : "px-2.5"}`}
						role={
							item.type === "radio"
								? "menuitemradio"
								: item.type === "checkbox"
									? "menuitemcheckbox"
									: "menuitem"
						}
						aria-checked={checkable ? Boolean(item.checked) : undefined}
						aria-disabled={disabled || undefined}
						aria-haspopup={item.submenu ? "menu" : undefined}
						aria-expanded={item.submenu ? openSubmenu === index : undefined}
						data-slot="menu-item"
						data-hovered={activeIndex === index || openSubmenu === index || undefined}
						data-disabled={disabled || undefined}
						onMouseEnter={() => !disabled && onHover(index)}
						onMouseMove={() => !disabled && activeIndex !== index && onHover(index)}
						onClick={() => !disabled && onPress(index)}
					>
						{hasTicks && (
							<span
								aria-hidden="true"
								className={`menu-item__indicator ${styles.tick}`}
								data-slot="menu-item-indicator"
							>
								{item.checked && <CheckIcon />}
							</span>
						)}
						<span className={styles.label} data-slot="label">
							{item.label}
						</span>
						{item.submenu && (
							<span className={styles.submenuArrow} data-slot="submenu-indicator">
								<ChevronIcon />
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

export default function HudMenuWindow() {
	const [request, setRequest] = useState<MenuRequest | null>(null);
	const [layout, setLayout] = useState<Layout | null>(null);
	// The highlighted row, the open side menu and its row, and which list the arrow keys
	// move in. Mirrored in a ref so keys pressed faster than React renders see the latest.
	const [nav, setNavState] = useState<Nav>(NO_NAV);
	const navRef = useRef<Nav>(NO_NAV);
	const setNav = useCallback((patch: Partial<Nav>) => {
		navRef.current = { ...navRef.current, ...patch };
		setNavState(navRef.current);
	}, []);
	const cardRef = useRef<HTMLDivElement>(null);
	const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
	const submenuRefs = useRef<Record<number, HTMLDivElement | null>>({});
	const closeTimer = useRef<number | null>(null);

	useEffect(() => {
		const unsubscribeOpen = window.electronAPI.onHudMenuOpen((next) => {
			setLayout(null);
			setNav(NO_NAV);
			rowRefs.current = [];
			submenuRefs.current = {};
			setRequest(next);
		});
		const unsubscribeShown = window.electronAPI.onHudMenuShown((token) => {
			requestAnimationFrame(() =>
				requestAnimationFrame(() => window.electronAPI.hudMenuPainted(token)),
			);
		});
		window.electronAPI.hudMenuPageReady();
		return () => {
			unsubscribeOpen();
			unsubscribeShown();
		};
	}, [setNav]);

	// Measures the menu and its side menus, places them on the bar's display, and
	// tells the window where to go.
	useLayoutEffect(() => {
		const card = cardRef.current;
		if (!request || layout || !card) return;
		const area = request.workArea;
		const top = area.y + EDGE;
		const bottom = area.y + area.height - EDGE;
		const left = area.x + EDGE;
		const right = area.x + area.width - EDGE;

		const width = card.offsetWidth;
		const height = Math.min(card.offsetHeight, bottom - top);
		const x = clamp(request.anchor.x, left, right - width);
		let y = request.anchor.y;
		// Below the bar when it fits, otherwise ending just above it.
		if (y + height > bottom && typeof request.anchor.above === "number") {
			y = request.anchor.above - height;
		}
		y = clamp(y, top, bottom - height);
		const cardRect = { x, y, width, height };

		const submenus: Record<number, Rect> = {};
		const entries = Object.entries(submenuRefs.current).filter(
			(entry): entry is [string, HTMLDivElement] => entry[1] !== null,
		);
		const widest = Math.max(0, ...entries.map(([, node]) => node.offsetWidth));
		// To the right, as macOS does, unless the screen ends first.
		const toRight = x + width + SUBMENU_GAP + widest <= right;
		for (const [key, node] of entries) {
			const index = Number(key);
			const row = rowRefs.current[index];
			const subWidth = node.offsetWidth;
			const subHeight = Math.min(node.offsetHeight, bottom - top);
			const subY = clamp(
				y + (row?.offsetTop ?? 0) - card.scrollTop - MENU_PADDING,
				top,
				bottom - subHeight,
			);
			const subX = toRight ? x + width + SUBMENU_GAP : x - SUBMENU_GAP - subWidth;
			submenus[index] = { x: subX, y: subY, width: subWidth, height: subHeight };
		}

		const rects = [cardRect, ...Object.values(submenus)];
		const minX = Math.floor(Math.min(...rects.map((rect) => rect.x)) - SHADOW.side);
		const minY = Math.floor(Math.min(...rects.map((rect) => rect.y)) - SHADOW.top);
		const maxX = Math.ceil(Math.max(...rects.map((rect) => rect.x + rect.width)) + SHADOW.side);
		const maxY = Math.ceil(
			Math.max(...rects.map((rect) => rect.y + rect.height)) + SHADOW.bottom,
		);
		setLayout({ origin: { x: minX, y: minY }, card: cardRect, submenus });
		window.electronAPI.hudMenuLaidOut(request.token, {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		});
	}, [request, layout]);

	const cancelSubmenuClose = useCallback(() => {
		if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
		closeTimer.current = null;
	}, []);

	const choose = useCallback(
		(id: string | null) => {
			if (!request) return;
			cancelSubmenuClose();
			window.electronAPI.hudMenuChoose(request.token, id);
			setRequest(null);
			setLayout(null);
		},
		[request, cancelSubmenuClose],
	);

	const openSubmenuAt = useCallback(
		(index: number, withKeyboard: boolean) => {
			const submenu = request?.items[index]?.submenu;
			if (!submenu) return;
			cancelSubmenuClose();
			setNav({
				open: index,
				inSub: withKeyboard,
				sub: withKeyboard ? firstSelectable(submenu) : -1,
			});
		},
		[request, cancelSubmenuClose, setNav],
	);

	const closeSubmenu = useCallback(() => {
		cancelSubmenuClose();
		setNav({ open: null, sub: -1, inSub: false });
	}, [cancelSubmenuClose, setNav]);

	const pressMain = useCallback(
		(index: number) => {
			const item = request?.items[index];
			if (!item || !isSelectable(item)) return;
			if (item.submenu) openSubmenuAt(index, false);
			else choose(item.id ?? null);
		},
		[request, openSubmenuAt, choose],
	);

	const hoverMain = useCallback(
		(index: number) => {
			setNav({ active: index, inSub: false });
			if (request?.items[index]?.submenu) {
				openSubmenuAt(index, false);
			} else if (navRef.current.open !== null && closeTimer.current === null) {
				closeTimer.current = window.setTimeout(() => {
					closeTimer.current = null;
					setNav({ open: null, sub: -1 });
				}, SUBMENU_CLOSE_DELAY_MS);
			}
		},
		[request, openSubmenuAt, setNav],
	);

	useEffect(() => {
		if (!request) return;
		const onKeyDown = (event: KeyboardEvent) => {
			const items = request.items;
			const { active, open, sub, inSub: wantsSub } = navRef.current;
			const subItems = open !== null ? (items[open]?.submenu ?? null) : null;
			const inSub = wantsSub && subItems !== null;
			const list = inSub && subItems ? subItems : items;
			const current = inSub ? sub : active;
			const setCurrent = (index: number) =>
				setNav(inSub ? { sub: index } : { active: index });
			switch (event.key) {
				case "ArrowDown":
				case "ArrowUp": {
					const next = step(list, current, event.key === "ArrowDown" ? 1 : -1);
					if (next >= 0) setCurrent(next);
					if (!inSub && open !== null) closeSubmenu();
					break;
				}
				case "Home":
					setCurrent(firstSelectable(list));
					break;
				case "End":
					setCurrent(step(list, 0, -1));
					break;
				case "ArrowRight":
					if (!inSub && current >= 0 && items[current]?.submenu) {
						openSubmenuAt(current, true);
					}
					break;
				case "ArrowLeft":
					if (inSub) closeSubmenu();
					break;
				case "Enter":
				case " ": {
					const item = list[current];
					if (!item || !isSelectable(item)) break;
					if (!inSub && item.submenu) openSubmenuAt(current, true);
					else choose(item.id ?? null);
					break;
				}
				case "Escape":
					if (inSub) closeSubmenu();
					else choose(null);
					break;
				default:
					return;
			}
			event.preventDefault();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [request, choose, closeSubmenu, openSubmenuAt, setNav]);

	useEffect(() => cancelSubmenuClose, [cancelSubmenuClose]);

	if (!request) return null;
	const place = (rect: Rect | undefined) =>
		rect && layout
			? {
					left: rect.x - layout.origin.x,
					top: rect.y - layout.origin.y,
					maxHeight: rect.height,
				}
			: { left: 0, top: 0 };

	return (
		<div
			className={styles.root}
			// A press on the see-through margin closes the menu, like a press anywhere else.
			onMouseDown={(event) => event.target === event.currentTarget && choose(null)}
		>
			<div
				ref={cardRef}
				className={`${styles.card} ${layout ? "" : styles.closed}`}
				style={place(layout?.card)}
				onMouseLeave={() => nav.open === null && setNav({ active: -1 })}
			>
				<MenuRows
					items={request.items}
					activeIndex={nav.inSub ? -1 : nav.active}
					openSubmenu={nav.open}
					rowRefs={rowRefs}
					onHover={hoverMain}
					onPress={pressMain}
				/>
			</div>
			{request.items.map((item, index) =>
				item.submenu ? (
					<div
						key={`submenu:${index}`}
						ref={(node) => {
							submenuRefs.current[index] = node;
						}}
						className={`${styles.card} ${layout && nav.open === index ? "" : styles.closed}`}
						style={place(layout?.submenus[index])}
						onMouseEnter={cancelSubmenuClose}
						onMouseLeave={() => setNav({ sub: -1 })}
					>
						<MenuRows
							items={item.submenu}
							activeIndex={nav.open === index ? nav.sub : -1}
							onHover={(subItem) => {
								cancelSubmenuClose();
								setNav({ inSub: true, sub: subItem });
							}}
							onPress={(subItem) => {
								const picked = item.submenu?.[subItem];
								if (picked && isSelectable(picked)) choose(picked.id ?? null);
							}}
						/>
					</div>
				) : null,
			)}
		</div>
	);
}
