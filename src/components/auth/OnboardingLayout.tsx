import { Description, Modal } from "@heroui/react";
import type { ReactNode } from "react";

/** The welcome dialog keeps the padding, heading type and button size of every other dialog. */
export function OnboardingBody({
	children,
	scrollable = true,
}: {
	children: ReactNode;
	scrollable?: boolean;
}) {
	return (
		<div
			data-onboarding-body
			className={`space-y-5 p-6 ${scrollable ? "min-h-0 flex-1 overflow-y-auto" : "shrink-0 pb-5"}`}
		>
			{children}
		</div>
	);
}

export function OnboardingHeader({
	title,
	description,
	centered = false,
}: {
	title: ReactNode;
	description: string;
	centered?: boolean;
}) {
	return (
		<Modal.Header
			className={`gap-1.5 p-0 ${centered ? "items-center text-center" : "items-start pr-8 text-left"}`}
		>
			<Modal.Heading className="text-xl leading-7">{title}</Modal.Heading>
			<Description className="text-sm leading-relaxed">{description}</Description>
		</Modal.Header>
	);
}

export function OnboardingFooter({ children }: { children: ReactNode }) {
	return (
		<Modal.Footer className="mt-0 shrink-0 justify-between gap-4 px-6 pb-6">
			{children}
		</Modal.Footer>
	);
}
