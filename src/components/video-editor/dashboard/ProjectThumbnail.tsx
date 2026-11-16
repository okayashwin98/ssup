import { Skeleton } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageSquare } from "@/components/ui/icons";
import { PROJECT_THUMBNAIL_RENDER_VERSION } from "@/lib/projectThumbnail";
import type { ProjectPreviewData } from "@/types/projectPreview";
import { toFileUrl } from "../projectPersistence";
import { generateProjectThumbnail } from "./generateProjectThumbnail";
import { ProjectHoverPreview } from "./ProjectHoverPreview";
import { getOrCreateProjectThumbnail, peekProjectThumbnail } from "./projectThumbnailCache";

/** Wait after a card appears, so opening Home is never competing with preview renders. */
const COMPOSE_DELAY_MS = 600;

export function ProjectThumbnail({
	path,
	projectPath,
	composed = false,
	previewActive = false,
	revision = 0,
	videoSource,
}: {
	path: string | null;
	projectPath?: string;
	/** The saved preview already shows the finished edit; otherwise one is rendered in the background. */
	composed?: boolean;
	previewActive?: boolean;
	revision?: number;
	videoSource?: string;
}) {
	const [loadedSource, setLoadedSource] = useState<string | null>(null);
	const [failedSource, setFailedSource] = useState<string | null>(null);
	const [visible, setVisible] = useState(false);
	const composeKey = `${PROJECT_THUMBNAIL_RENDER_VERSION}:${projectPath}:${revision}`;
	const [generated, setGenerated] = useState(() => {
		const url = projectPath ? peekProjectThumbnail(composeKey) : undefined;
		return url ? { key: composeKey, url } : null;
	});
	const generatedUrl = generated?.key === composeKey ? generated.url : null;
	const [composeFailed, setComposeFailed] = useState<string | null>(null);
	useEffect(() => {
		if (!projectPath || composed || !visible || generatedUrl || composeFailed === composeKey)
			return;
		let active = true;
		const timer = window.setTimeout(() => {
			void getOrCreateProjectThumbnail(composeKey, async () => {
				const preview = await window.electronAPI.getProjectPreview(projectPath);
				if (!preview.success)
					throw new Error(preview.error || "Project preview unavailable");
				const url = await generateProjectThumbnail(preview.value);
				// Saving is optional: a read-only or offline project still shows the preview now.
				void window.electronAPI
					.cacheProjectThumbnail?.(projectPath, revision, url)
					.catch(() => undefined);
				return url;
			})
				.then((url) => {
					if (active) setGenerated({ key: composeKey, url });
				})
				.catch((error) => {
					// The current preview stays in place.
					console.warn("Could not render the finished-edit preview:", error);
					if (active) setComposeFailed(composeKey);
				});
		}, COMPOSE_DELAY_MS);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [projectPath, composed, visible, generatedUrl, composeFailed, composeKey, revision]);
	const [preview, setPreview] = useState<ProjectPreviewData | null>(null);
	const host = useRef<HTMLDivElement>(null);
	const finish = useCallback(() => setPreview(null), []);
	useEffect(() => {
		if (
			!previewActive ||
			!projectPath ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		)
			return;
		let active = true;
		const timer = window.setTimeout(() => {
			void window.electronAPI
				.getProjectPreview(projectPath)
				.then((result) => {
					if (active && !document.hidden && result.success) setPreview(result.value);
				})
				.catch(() => undefined);
		}, 300);
		const observer = new IntersectionObserver((entries) => {
			if (entries.every((entry) => !entry.isIntersecting)) {
				active = false;
				setPreview(null);
			}
		});
		if (host.current) observer.observe(host.current);
		return () => {
			active = false;
			clearTimeout(timer);
			observer.disconnect();
			setPreview(null);
		};
	}, [previewActive, projectPath, revision]);
	useEffect(() => {
		if ((!videoSource && !projectPath) || !host.current) return;
		const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
			rootMargin: "100px",
		});
		observer.observe(host.current);
		return () => observer.disconnect();
	}, [videoSource, projectPath]);

	const sourceKey = `${path}:${revision}`;
	return (
		<div
			ref={host}
			className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-default/60"
		>
			{!generatedUrl && path && loadedSource !== sourceKey && failedSource !== sourceKey && (
				<Skeleton className="absolute inset-0 rounded-xl" />
			)}
			{generatedUrl ? (
				<img
					src={generatedUrl}
					alt=""
					draggable={false}
					data-composed-thumbnail
					className="h-full w-full object-cover"
				/>
			) : path && failedSource !== sourceKey ? (
				<img
					src={
						/^(data:|blob:)/.test(path)
							? path
							: `${/^https?:/.test(path) ? path : toFileUrl(path)}?v=${revision}`
					}
					alt=""
					loading="lazy"
					draggable={false}
					onError={() => setFailedSource(sourceKey)}
					onLoad={() => setLoadedSource(sourceKey)}
					className="h-full w-full object-cover"
				/>
			) : videoSource && visible ? (
				<video
					src={videoSource}
					preload="metadata"
					muted
					playsInline
					tabIndex={-1}
					aria-hidden="true"
					className="pointer-events-none h-full w-full object-cover"
				/>
			) : (
				<ImageSquare weight="fill" className="size-8 text-muted-foreground/20" />
			)}
			{previewActive && preview && <ProjectHoverPreview data={preview} onFinish={finish} />}
		</div>
	);
}
