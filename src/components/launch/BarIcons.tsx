import type { SVGProps } from "react";

// Custom 20 × 20 icons for the start bar, drawn in the text colour.

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

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<path
				d="M13.3334 8.57706L16.2294 6.79194C16.4865 6.63344 16.8092 6.62646 17.0729 6.77368C17.3366 6.92091 17.5 7.1993 17.5 7.50132V13.332C17.5 13.634 17.3366 13.9124 17.0729 14.0596C16.8092 14.2068 16.4865 14.1999 16.2294 14.0414L13.3334 12.2562"
				{...stroke}
			/>
			<rect x="2.5" y="5" width="10.8333" height="10.8333" rx="2.5" {...stroke} />
		</Frame>
	);
}

export function MicrophoneIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<path
				d="M10 12.1451V12.1451C8.57839 12.1446 7.42606 10.9923 7.4256 9.57068V5.27973C7.42606 3.85811 8.57839 2.70578 10 2.70532V2.70532C11.4216 2.70578 12.5739 3.85811 12.5744 5.27973V9.57068C12.5746 10.2535 12.3035 10.9085 11.8206 11.3913C11.3378 11.8741 10.6828 12.1453 10 12.1451Z"
				{...stroke}
			/>
			<path
				d="M15.8358 9.70825C15.8358 12.9313 13.223 15.544 10 15.544V15.544C6.77701 15.544 4.16425 12.9313 4.16425 9.70825"
				{...stroke}
			/>
			<path d="M10 17.2947V15.544" {...stroke} />
		</Frame>
	);
}

export function SystemAudioIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<rect x="2" y="4" width="16" height="12" rx="2" {...stroke} />
			<path d="M7 18.5H13" {...stroke} />
			{/* The note is drawn with a thinner line, as in the source file. */}
			<path
				d="M10.5238 10.3114C10.9867 10.7742 10.9867 11.5252 10.5238 11.9881C10.061 12.4509 9.31 12.4509 8.84714 11.9881C8.38429 11.5252 8.38429 10.7742 8.84714 10.3114C9.31 9.84852 10.0603 9.84852 10.5238 10.3114M12.6494 7.59291L10.8707 7V11.1497"
				{...stroke}
				strokeWidth={1}
			/>
		</Frame>
	);
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<rect x="3.15771" y="3" width="14" height="14" rx="7" fill="currentColor" />
			<path d="M7.15771 7L13.1577 13M7.15771 13L13.1577 7" {...stroke} stroke="#24262D" />
		</Frame>
	);
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Frame {...props}>
			<path
				d="M15.6667 8V7.49998C15.6667 6.57951 14.9205 5.83331 14 5.83331L5 5.83334"
				{...stroke}
			/>
			<path
				d="M17.5 15.8333C17.5 16.7538 16.7538 17.5 15.8333 17.5H4.16667C3.24619 17.5 2.5 16.7538 2.5 15.8333V7.49998C2.5 6.57951 3.24619 5.83331 4.16667 5.83331H7.89213C8.16798 5.83331 8.42595 5.96982 8.58112 6.19788L9.78598 7.96871C9.94115 8.1968 10.1991 8.33332 10.475 8.33331H15.8333C16.7538 8.33331 17.5 9.0795 17.5 9.99998V15.8333Z"
				{...stroke}
			/>
		</Frame>
	);
}
