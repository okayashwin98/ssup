import { Alert, Button, Card, Toast, toast } from "@heroui/react";
import { LinkSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect } from "react";

export function Brand() {
	return (
		<span className="brand">
			<img src="/icon-64.png" alt="" width="28" height="28" />
			<span>SuperShare</span>
		</span>
	);
}

export interface Owner {
	name: string;
	avatarUrl?: string | null;
}

/** The owner's photo, or their initials until one is set. */
export function OwnerAvatar({ owner }: { owner?: Owner | null }) {
	if (owner?.avatarUrl) return <img className="owner-avatar" src={owner.avatarUrl} alt="" />;
	if (!owner?.name) return null;
	const initials = owner.name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
	return (
		<span className="owner-avatar owner-avatar-initials" aria-hidden="true">
			{initials}
		</span>
	);
}

/** Who shared the recording, in place of the app's own brand. */
export function OwnerBrand({ owner }: { owner: Owner }) {
	return (
		<span className="brand">
			<OwnerAvatar owner={owner} />
			<span>{owner.name}</span>
		</span>
	);
}

/** A ring with a fading tail. */
export function Spinner({ label }: { label: string }) {
	return <span className="share-spinner" role="status" aria-label={label} />;
}

export function Notice({ children }: { children: ReactNode }) {
	return (
		<Alert status="danger" role="alert">
			<Alert.Indicator>
				<WarningCircleIcon />
			</Alert.Indicator>
			<Alert.Content>
				<Alert.Description>{children}</Alert.Description>
			</Alert.Content>
		</Alert>
	);
}

export function CenteredCard({ children, header }: { children: ReactNode; header?: ReactNode }) {
	return (
		<main className="gate-page">
			<Card className="gate-card">
				<Card.Header>{header ?? <Brand />}</Card.Header>
				<Card.Content className="gate-content">{children}</Card.Content>
			</Card>
		</main>
	);
}

export async function copyLink(time = 0, code?: string) {
	const url = new URL(code ? `/s/${code}` : window.location.pathname, window.location.origin);
	if (time > 0) url.searchParams.set("t", String(Math.floor(time)));
	try {
		await navigator.clipboard.writeText(url.href);
		toast.success("Link copied");
	} catch {
		toast.danger("Could not copy the link. Copy the address from your browser.");
	}
}

export function CopyButton({ time = 0, code }: { time?: number; code?: string }) {
	return (
		<Button
			size="sm"
			variant="ghost"
			aria-label="Copy link"
			className="copy-link-button"
			onPress={() => void copyLink(time, code)}
		>
			<LinkSimpleIcon size={16} />
			{/* Phones show the icon alone. */}
			<span className="copy-link-label">Copy link</span>
		</Button>
	);
}

const TOAST_GAP = 16;
const TOAST_ROOM = 64;

/** Messages sit at the bottom, lifted to 4px above the comment box whenever they would cover it. */
export function Notifications() {
	useEffect(() => {
		const root = document.documentElement;
		let frame = 0;
		const place = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const viewport = window.innerHeight;
				let bottom = TOAST_GAP;
				const composer = document.querySelector<HTMLElement>(".composer:not([hidden])");
				const box = composer?.getBoundingClientRect();
				const region = document.querySelector(".toast-region")?.getBoundingClientRect();
				const left = region?.width ? region.left : TOAST_GAP;
				const right = region?.width ? region.right : window.innerWidth - TOAST_GAP;
				const sideBySide = !box || box.right <= left || box.left >= right;
				const inToastBand = box && box.top < viewport - TOAST_GAP && box.bottom > viewport - TOAST_GAP - TOAST_ROOM;
				if (box && !sideBySide && inToastBand) bottom = Math.max(TOAST_GAP, viewport - box.top + 4);
				root.style.setProperty("--toast-bottom", `${Math.round(bottom)}px`);
			});
		};
		place();
		const changes = new MutationObserver(place);
		changes.observe(document.body, { childList: true, subtree: true });
		const sizes = new ResizeObserver(place);
		sizes.observe(document.body);
		window.addEventListener("resize", place);
		document.addEventListener("scroll", place, { capture: true, passive: true });
		return () => {
			cancelAnimationFrame(frame);
			changes.disconnect();
			sizes.disconnect();
			window.removeEventListener("resize", place);
			document.removeEventListener("scroll", place, { capture: true });
		};
	}, []);
	return <Toast.Provider placement="bottom" />;
}
