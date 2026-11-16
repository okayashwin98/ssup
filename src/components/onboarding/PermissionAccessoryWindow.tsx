import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PERMISSION_NAMES = { screen: "Screen Recording", accessibility: "Accessibility" } as const;

/**
 * The window below System Settings while SuperShare is missing from a permission's list:
 * its icon drags the running app straight into that list. The window follows System
 * Settings and closes by itself once access is on.
 */
export default function PermissionAccessoryWindow() {
	const permission =
		new URLSearchParams(window.location.search).get("permission") === "screen"
			? PERMISSION_NAMES.screen
			: PERMISSION_NAMES.accessibility;
	const [failed, setFailed] = useState(false);
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-transparent p-2">
			<Card className="w-full gap-3" aria-label={`Add SuperShare to ${permission}`}>
				<div className="flex flex-col gap-1">
					<h1 className="text-[13px] font-semibold leading-[1.35]">
						Add SuperShare to {permission}
					</h1>
					<p className="text-xs leading-[1.45] text-muted">
						Drag the icon into the list above, then turn SuperShare on.
					</p>
				</div>
				{/* The drag itself is native, so macOS hands System Settings the app. */}
				<div
					data-permission-drag
					draggable
					role="img"
					aria-label={`Drag SuperShare to ${permission}`}
					className="flex cursor-grab items-center gap-3 rounded-xl border border-separator bg-default px-3 py-2 active:cursor-grabbing"
					onDragStart={(event) => {
						event.preventDefault();
						void window.electronAPI
							.startPermissionAccessoryDrag()
							.then((result) => setFailed(!result.success))
							.catch(() => setFailed(true));
					}}
				>
					{/* Relative, so it also loads from the packaged app's files. */}
					<img
						src="app-icons/recordlymac-128.png"
						alt=""
						draggable={false}
						className="size-8 shrink-0"
					/>
					<span className="text-[13px] font-medium">SuperShare</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<p role={failed ? "alert" : undefined} className="text-xs text-danger">
						{failed ? "Couldn’t start the drag. Try again." : ""}
					</p>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => void window.electronAPI.closePermissionAccessory()}
					>
						Back
					</Button>
				</div>
			</Card>
		</div>
	);
}
