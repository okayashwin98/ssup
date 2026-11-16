import { Export, LinkSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/contexts/I18nContext";
import { copyText } from "@/lib/copyText";
import { loadLocalProfile } from "@/lib/localProfile";
import { CLOUD_SHARE_ENDPOINT as DEFAULT_CLOUD_ENDPOINT } from "./endpoint";
import { PublishedVideoPreview } from "./PublishedVideoPreview";
import { saveProjectShareLink } from "./projectShareLinks";
import { SharedRecordings } from "./SharedRecordings";
import {
	checkShareCapacity,
	RECORDING_LIMIT_MESSAGE,
	subscribeShareCapacityChanges,
} from "./shareCapacity";

const SHARING_UNAVAILABLE = "Cloud sharing is not available in this build yet.";

type Props = {
	projectPath?: string | null;
	filePath?: string;
	projectTitle: string;
	prepareFile?: () => Promise<string | undefined>;
	preparationProgress?: number;
	onCancelPrepare?: () => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	hideTrigger?: boolean;
	/** The personal share password; without it (or an endpoint) sharing is unavailable. */
	shareToken?: string;
	inline?: boolean;
	onBusyChange?: (busy: boolean) => void;
	/** The editor's captions for the CC subtitles; the video is transcribed without them. */
	captionCues?: Array<{ startMs: number; endMs: number; text: string }>;
};

export function CloudShareButton({
	projectPath,
	filePath,
	projectTitle,
	prepareFile,
	preparationProgress = 0,
	onCancelPrepare,
	open: controlledOpen,
	onOpenChange,
	hideTrigger = false,
	shareToken,
	inline = false,
	onBusyChange,
	captionCues,
}: Props) {
	const { t } = useI18n();
	const sharingAvailable = Boolean(shareToken && DEFAULT_CLOUD_ENDPOINT);
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = useCallback(
		(nextOpen: boolean) => {
			onOpenChange?.(nextOpen);
			if (controlledOpen === undefined) setInternalOpen(nextOpen);
		},
		[controlledOpen, onOpenChange],
	);
	const [uploadId, setUploadId] = useState<string>();
	const [progress, setProgress] = useState(0);
	const [uploading, setUploading] = useState(false);
	const [capacityAvailable, setCapacityAvailable] = useState<boolean | null>(null);
	const [checkingCapacity, setCheckingCapacity] = useState(false);
	useEffect(() => {
		setCapacityAvailable(null);
		setCheckingCapacity(false);
		if (!shareToken || !DEFAULT_CLOUD_ENDPOINT) return;
		let active = true;
		let generation = 0;
		const refresh = () => {
			const request = ++generation;
			setCheckingCapacity(true);
			void checkShareCapacity(DEFAULT_CLOUD_ENDPOINT, shareToken)
				.then((available) => {
					if (active && request === generation) setCapacityAvailable(available);
				})
				.catch(() => {
					if (active && request === generation) setCapacityAvailable(null);
				})
				.finally(() => {
					if (active && request === generation) setCheckingCapacity(false);
				});
		};
		const unsubscribe = subscribeShareCapacityChanges(refresh);
		refresh();
		return () => {
			active = false;
			unsubscribe();
		};
	}, [shareToken]);
	useEffect(() => {
		onBusyChange?.(uploading);
	}, [uploading, onBusyChange]);
	const [phase, setPhase] = useState<"idle" | "preparing" | "uploading">("idle");
	const [error, setError] = useState<string>();
	const [shareUrl, setShareUrl] = useState<string>();
	const [copied, setCopied] = useState(false);
	const [notes, setNotes] = useState("");
	const preparedFileRef = useRef<string | undefined>(undefined);
	const cancelRequestedRef = useRef(false);
	const activeUploadId = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (phase === "preparing" && Number.isFinite(preparationProgress)) {
			setProgress((current) =>
				Math.max(current, Math.min(70, Math.round(preparationProgress * 0.7))),
			);
		}
	}, [phase, preparationProgress]);

	const discardPreparedFile = useCallback(() => {
		const preparedPath = preparedFileRef.current;
		preparedFileRef.current = undefined;
		if (preparedPath) void window.electronAPI.discardExportedTemp(preparedPath);
	}, []);

	useEffect(() => discardPreparedFile, [discardPreparedFile]);

	useEffect(() => {
		return window.electronAPI.onCloudShareProgress((next) => {
			if (next.uploadId !== activeUploadId.current) return;
			if (next.totalBytes <= 0 || !Number.isFinite(next.uploadedBytes)) return;
			setProgress((current) =>
				Math.max(
					current,
					Math.min(99, 70 + Math.round((next.uploadedBytes / next.totalBytes) * 29)),
				),
			);
		});
	}, []);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen && uploading) return;
			setOpen(nextOpen);
			if (nextOpen) {
				setError(undefined);
				setCopied(false);
			} else {
				discardPreparedFile();
			}
		},
		[discardPreparedFile, setOpen, uploading],
	);

	const handleUpload = useCallback(async () => {
		setUploading(true);
		setProgress(0);
		setPhase("idle");
		cancelRequestedRef.current = false;
		setError(undefined);
		setShareUrl(undefined);
		try {
			if (!DEFAULT_CLOUD_ENDPOINT) throw new Error(SHARING_UNAVAILABLE);
			if (!shareToken) throw new Error(SHARING_UNAVAILABLE);
			const available = await checkShareCapacity(DEFAULT_CLOUD_ENDPOINT, shareToken);
			setCapacityAvailable(available);
			if (!available) throw new Error(RECORDING_LIMIT_MESSAGE);
			if (cancelRequestedRef.current) return;
			setPhase("preparing");
			let resolvedFilePath = filePath ?? preparedFileRef.current;
			if (!resolvedFilePath) {
				resolvedFilePath = await prepareFile?.();
				if (cancelRequestedRef.current) {
					if (resolvedFilePath)
						void window.electronAPI.discardExportedTemp(resolvedFilePath);
					return;
				}
				if (!resolvedFilePath) throw new Error(t("editor.cloud.prepareFailed"));
				preparedFileRef.current = resolvedFilePath;
			}
			const nextUploadId = crypto.randomUUID();
			setUploadId(nextUploadId);
			activeUploadId.current = nextUploadId;
			setProgress(70);
			setPhase("uploading");
			const result = await window.electronAPI.cloudShareUpload({
				filePath: resolvedFilePath,
				endpoint: DEFAULT_CLOUD_ENDPOINT,
				token: shareToken,
				title: projectTitle,
				notes: notes.trim() || undefined,
				uploadId: nextUploadId,
				subtitles: true,
				captionCues,
				...loadLocalProfile(),
			});
			if (!result.success || !result.shareUrl) {
				if (!result.canceled) setError(result.error || t("editor.cloud.uploadFailed"));
				return;
			}
			setProgress(100);
			setShareUrl(result.shareUrl);
			if (projectPath) {
				try {
					saveProjectShareLink(projectPath, result.shareUrl);
				} catch {
					toast.error("Share created, but its link could not be saved locally");
				}
			}
			toast.success(t("editor.cloud.linkCreated"));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setUploading(false);
			setPhase("idle");
			setUploadId(undefined);
			activeUploadId.current = undefined;
		}
	}, [projectPath, shareToken, filePath, notes, prepareFile, projectTitle, captionCues, t]);

	const handleCancel = useCallback(async () => {
		cancelRequestedRef.current = true;
		if (phase === "preparing") onCancelPrepare?.();
		if (uploadId) await window.electronAPI.cloudShareCancel(uploadId);
	}, [onCancelPrepare, phase, uploadId]);

	const copyShareUrl = useCallback(async () => {
		if (!shareUrl) return;
		try {
			await copyText(shareUrl);
			setCopied(true);
			toast.success(t("editor.cloud.linkCopied"));
		} catch {
			setCopied(false);
			toast.error(t("editor.cloud.copyFailed"));
		}
	}, [shareUrl, t]);

	const form = (
		<>
			{shareUrl ? (
				<div className="space-y-3">
					<PublishedVideoPreview key={shareUrl} url={shareUrl} />
					<Button
						type="button"
						variant="accent"
						onClick={copyShareUrl}
						className="w-full"
					>
						{copied ? (
							<Check className="h-4 w-4" />
						) : (
							<LinkSimple className="h-4 w-4" />
						)}
						{copied ? t("editor.cloud.copied") : "Copy link"}
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					{!uploading && (
						<div className="space-y-2">
							<Label htmlFor="cloud-share-notes">{t("editor.cloud.notes")}</Label>
							<textarea
								id="cloud-share-notes"
								placeholder={t("editor.cloud.notesPlaceholder")}
								value={notes}
								onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
								disabled={uploading}
								className="block h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
							/>
							{!inline && (
								<p className="text-right text-[11px] text-muted-foreground">
									{notes.length}/2000
								</p>
							)}
						</div>
					)}
					{uploading ? (
						<div className="space-y-2">
							<div className="h-2 overflow-hidden rounded-full bg-foreground/10">
								<div
									className="h-full bg-accent transition-all"
									style={{ width: `${progress}%` }}
								/>
							</div>
							<p className="text-xs text-muted-foreground">Uploading · {progress}%</p>
						</div>
					) : null}
					{error || capacityAvailable === false ? (
						<p className="text-sm text-destructive">
							{error || RECORDING_LIMIT_MESSAGE}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						{!sharingAvailable ? (
							<p className="text-sm text-muted-foreground">
								{SHARING_UNAVAILABLE} You can still save videos to your computer.
							</p>
						) : uploading ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => void handleCancel()}
							>
								{t("common.actions.cancel")}
							</Button>
						) : (
							<Button
								type="button"
								variant="accent"
								className="w-full"
								disabled={checkingCapacity || capacityAvailable === false}
								onClick={() => void handleUpload()}
							>
								<Export className="h-4 w-4" />
								Share
							</Button>
						)}
					</div>
				</div>
			)}
		</>
	);
	if (inline) return <div>{form}</div>;

	return (
		<>
			{hideTrigger ? null : (
				<Button
					type="button"
					variant="outline"
					onClick={() => setOpen(true)}
					disabled={!filePath && !prepareFile}
					className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border-foreground/10 bg-foreground/5 px-3 text-foreground hover:bg-foreground/10 disabled:opacity-40"
					title={t("editor.cloud.createLinkTitle")}
				>
					<Export className="h-4 w-4" />
					<span className="text-sm font-semibold tracking-tight">
						{t("editor.cloud.createLink")}
					</span>
				</Button>
			)}
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="max-w-md border-foreground/10 bg-editor-dialog text-foreground">
					<DialogHeader>
						<DialogTitle>{t("editor.cloud.heading")}</DialogTitle>
						<DialogDescription>{t("editor.cloud.description")}</DialogDescription>
						<p className="text-xs text-muted-foreground">Links expire after 30 days.</p>
					</DialogHeader>

					{!uploading && sharingAvailable && shareToken && (
						<SharedRecordings
							token={shareToken}
							endpoint={DEFAULT_CLOUD_ENDPOINT}
							refreshKey={shareUrl}
						/>
					)}

					{form}
				</DialogContent>
			</Dialog>
		</>
	);
}
