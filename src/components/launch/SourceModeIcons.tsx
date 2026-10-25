import type { SVGProps } from "react";

// Custom 20 × 20 icons for the bar's Display, Window and Area buttons, drawn in the text colour.

const stroke = {
	stroke: "currentColor",
	strokeWidth: 1.25,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

function Frame({ children, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
			{children}
		</svg>
	);
}

export function DisplayModeIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<rect x="2" y="4" width="16" height="12" rx="2" {...stroke} />
			<rect x="4" y="12" width="12" height="2" rx="0.625" fill="currentColor" />
		</Frame>
	);
}

export function WindowModeIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<rect x="2" y="4" width="16" height="12" rx="2" {...stroke} />
			<path
				d="M4.5875 6.57498C4.585 6.57498 4.58334 6.57664 4.58334 6.57914C4.58334 6.58164 4.585 6.58331 4.5875 6.58331C4.59 6.58331 4.59167 6.58164 4.59167 6.57914C4.59167 6.57664 4.59 6.57498 4.5875 6.57498 M6.70664 6.57498C6.70414 6.57498 6.70248 6.57664 6.70248 6.57914C6.70248 6.58164 6.70414 6.58331 6.70664 6.58331C6.70914 6.58331 6.71081 6.58164 6.71081 6.57914C6.71081 6.57664 6.70914 6.57498 6.70664 6.57498 M8.82328 6.57498C8.82078 6.57498 8.81912 6.57664 8.81912 6.57914C8.81912 6.58164 8.82078 6.58331 8.82328 6.58331C8.82578 6.58331 8.82745 6.58164 8.82745 6.57914C8.82745 6.57664 8.82495 6.57498 8.82328 6.57498"
				{...stroke}
			/>
		</Frame>
	);
}

export function AreaModeIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<path
				d="M4.16667 2.5C3.7246 2.49988 3.30061 2.67543 2.98802 2.98802C2.67543 3.30061 2.49988 3.7246 2.5 4.16667 M2.5 15.8333C2.49988 16.2754 2.67543 16.6994 2.98802 17.012C3.30061 17.3245 3.7246 17.5001 4.16667 17.5 M2.49998 11.3917V13.0583 M2.49998 6.94165V8.60832 M6.94165 17.5H8.60832 M6.94165 2.49998H8.60832 M15.8333 17.5C16.2754 17.5001 16.6994 17.3245 17.012 17.012C17.3245 16.6994 17.5001 16.2754 17.5 15.8333 M17.5 4.16667C17.5001 3.7246 17.3245 3.30061 17.012 2.98802C16.6994 2.67543 16.2754 2.49988 15.8333 2.5 M17.5 8.60832V6.94165 M17.5 13.0583V11.3917 M13.0583 2.49998H11.3917 M13.0583 17.5H11.3917"
				{...stroke}
			/>
		</Frame>
	);
}
