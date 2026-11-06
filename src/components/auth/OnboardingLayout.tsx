import type { ReactNode } from "react";
import { Description, Modal } from "@heroui/react";
import "./Onboarding.css";

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
			className={`px-6 py-7 sm:px-10 sm:py-8 ${scrollable ? "min-h-0 flex-1 overflow-y-auto" : "shrink-0"}`}
		>
			<div className="mx-auto w-full max-w-[560px] space-y-6">{children}</div>
		</div>
	);
}

export function OnboardingHeader({
	title,
	description,
	showBrand = true,
	centered = false,
}: {
	title: ReactNode;
	description: string;
	showBrand?: boolean;
	centered?: boolean;
}) {
	return (
		<Modal.Header
			className={`gap-2 p-0 ${centered ? "items-center text-center" : "items-start text-left"}`}
		>
			{showBrand && (
				<div
					data-onboarding-brand
					className="mb-3 flex items-center gap-2.5"
					aria-label="SuperShare"
				>
					<img
						src={`${import.meta.env.BASE_URL}app-icons/recordly-128.png`}
						alt=""
						className="size-10 rounded-xl"
					/>
					<span className="text-lg font-semibold tracking-tight">SuperShare</span>
				</div>
			)}
			<Modal.Heading className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
				{title}
			</Modal.Heading>
			<Description className="text-sm leading-relaxed">{description}</Description>
		</Modal.Header>
	);
}

export function OnboardingFooter({ children }: { children: ReactNode }) {
	return (
		<Modal.Footer className="mt-0 shrink-0 px-6 pb-6 pt-3 sm:px-10 sm:pb-8">
			<div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 [&_.button]:h-11 [&_.button]:rounded-xl">
				{children}
			</div>
		</Modal.Footer>
	);
}
