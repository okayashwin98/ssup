import { createReadStream, constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { app, ipcMain, shell } from "electron";
import {
	normalizeCloudEndpoint,
	parseCloudRecordingList,
	parseCloudShareTicket,
	parseEditorCaptionSegments,
} from "../cloudShareContract";
import { isOwnedExportPath } from "../export/exportStream";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { probeNativeVideoMetadata } from "../ffmpeg/metadata";
import { isAllowedLocalReadPath } from "../project/manager";
import { renderShareCard } from "../recording/shareCard";
import { createShareSubtitles, type ShareSubtitleSegment } from "../recording/shareSubtitles";
import { createShareThumbnail } from "../recording/shareThumbnail";

const MAX_CONTROL_RESPONSE_BYTES = 1024 * 1024;
const MAX_AUTH_TOKEN_BYTES = 8192;
const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024;
const MULTIPART_PART_BYTES = 25 * 1024 * 1024;
const MULTIPART_PART_ATTEMPTS = 3;
const activeUploads = new Map<string, AbortController>();

type UploadedPart = { partNumber: number; etag: string };

class NonRetryableUploadError extends Error {}

function contentTypeFor(filePath: string) {
	switch (path.extname(filePath).toLowerCase()) {
		case ".mp4":
			return "video/mp4";
		case ".webm":
			return "video/webm";
		case ".mov":
			return "video/quicktime";
		case ".gif":
			return "image/gif";
		default:
			return "application/octet-stream";
	}
}

async function readJsonResponse(response: Response) {
	const text = await response.text();
	if (Buffer.byteLength(text) > MAX_CONTROL_RESPONSE_BYTES) {
		throw new Error("The cloud share server response was too large.");
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`The cloud share server returned invalid JSON (${response.status}).`);
	}
}

async function responseError(response: Response, fallback: string) {
	try {
		const body = await readJsonResponse(response);
		if (body && typeof body === "object" && "error" in body) {
			return String((body as { error: unknown }).error);
		}
	} catch {
		// Cloudflare may return an HTML/plain-text edge error instead of Worker JSON.
	}
	return `${fallback} (${response.status}).`;
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason ?? new Error("Upload aborted"));
			return;
		}
		const handleAbort = () => {
			clearTimeout(timeout);
			reject(signal.reason ?? new Error("Upload aborted"));
		};
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", handleAbort);
			resolve();
		}, delayMs);
		signal.addEventListener("abort", handleAbort, { once: true });
	});
}

function isRetryableUploadStatus(status: number) {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function uploadMultipart(options: {
	endpoint: string;
	shareCode: string;
	filePath: string;
	fileSize: number;
	contentType: string;
	token: string;
	signal: AbortSignal;
	onProgress: (uploadedBytes: number) => void;
}) {
	const endpointOrigin = new URL(options.endpoint).origin;
	const authHeaders = { authorization: `Bearer ${options.token}` };
	const startResponse = await fetch(
		new URL(`/api/upload-multipart/${options.shareCode}`, endpointOrigin),
		{
			method: "POST",
			headers: authHeaders,
			redirect: "error",
			signal: options.signal,
		},
	);
	if (!startResponse.ok) {
		throw new Error(await responseError(startResponse, "Could not start video upload"));
	}
	const startBody = await readJsonResponse(startResponse);
	const multipartUploadId =
		startBody &&
		typeof startBody === "object" &&
		"uploadId" in startBody &&
		typeof (startBody as { uploadId: unknown }).uploadId === "string"
			? (startBody as { uploadId: string }).uploadId
			: "";
	if (!multipartUploadId || Buffer.byteLength(multipartUploadId) > 2048) {
		throw new Error("The cloud share server returned an invalid multipart upload ID.");
	}

	const encodedUploadId = encodeURIComponent(multipartUploadId);
	const parts: UploadedPart[] = [];
	let confirmedBytes = 0;
	let completed = false;

	try {
		const partCount = Math.ceil(options.fileSize / MULTIPART_PART_BYTES);
		for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
			const partNumber = partIndex + 1;
			const start = partIndex * MULTIPART_PART_BYTES;
			const end = Math.min(options.fileSize, start + MULTIPART_PART_BYTES) - 1;
			const partSize = end - start + 1;
			let uploadedPart: UploadedPart | undefined;

			for (let attempt = 1; attempt <= MULTIPART_PART_ATTEMPTS; attempt += 1) {
				let attemptBytes = 0;
				const progress = new Transform({
					transform(chunk, _encoding, callback) {
						attemptBytes += chunk.length;
						options.onProgress(
							Math.min(options.fileSize, confirmedBytes + attemptBytes),
						);
						callback(null, chunk);
					},
				});
				const source = createReadStream(options.filePath, { start, end });
				const body = source.pipe(progress);
				source.on("error", (error) => body.destroy(error));
				try {
					const partResponse = await fetch(
						new URL(
							`/api/upload-part/${options.shareCode}/${encodedUploadId}/${partNumber}`,
							endpointOrigin,
						),
						{
							method: "PUT",
							headers: {
								...authHeaders,
								"content-type": options.contentType,
								"content-length": String(partSize),
							},
							body: body as unknown as BodyInit,
							duplex: "half",
							redirect: "error",
							signal: options.signal,
						} as RequestInit & { duplex: "half" },
					);
					if (!partResponse.ok) {
						const message = await responseError(
							partResponse,
							`Video part ${partNumber} failed`,
						);
						if (!isRetryableUploadStatus(partResponse.status)) {
							throw new NonRetryableUploadError(message);
						}
						throw new Error(message);
					} else {
						const partBody = await readJsonResponse(partResponse);
						const etag =
							partBody && typeof partBody === "object" && "etag" in partBody
								? (partBody as { etag: unknown }).etag
								: undefined;
						const returnedPartNumber =
							partBody && typeof partBody === "object" && "partNumber" in partBody
								? (partBody as { partNumber: unknown }).partNumber
								: undefined;
						if (typeof etag !== "string" || returnedPartNumber !== partNumber) {
							throw new NonRetryableUploadError(
								`The cloud share server returned invalid data for video part ${partNumber}.`,
							);
						}
						uploadedPart = { partNumber, etag };
						break;
					}
				} catch (error) {
					if (
						options.signal.aborted ||
						error instanceof NonRetryableUploadError ||
						attempt === MULTIPART_PART_ATTEMPTS
					) {
						throw error;
					}
				} finally {
					body.destroy();
					source.destroy();
				}

				options.onProgress(confirmedBytes);
				await waitForRetry(300 * 3 ** (attempt - 1), options.signal);
			}

			if (!uploadedPart) throw new Error(`Video part ${partNumber} could not be uploaded.`);
			parts.push(uploadedPart);
			confirmedBytes += partSize;
			options.onProgress(confirmedBytes);
		}

		const completeResponse = await fetch(
			new URL(`/api/upload-complete/${options.shareCode}/${encodedUploadId}`, endpointOrigin),
			{
				method: "POST",
				headers: { ...authHeaders, "content-type": "application/json" },
				body: JSON.stringify({ parts }),
				redirect: "error",
				signal: options.signal,
			},
		);
		if (!completeResponse.ok) {
			throw new Error(await responseError(completeResponse, "Could not finish video upload"));
		}
		completed = true;
	} finally {
		if (!completed) {
			try {
				await fetch(
					new URL(
						`/api/upload-abort/${options.shareCode}/${encodedUploadId}`,
						endpointOrigin,
					),
					{
						method: "POST",
						headers: authHeaders,
						redirect: "error",
						signal: AbortSignal.timeout(5000),
					},
				);
			} catch {
				// R2 also reaps abandoned multipart uploads, so cleanup is best-effort.
			}
		}
	}
}

async function fileExists(filePath: string) {
	return fs.access(filePath).then(
		() => true,
		() => false,
	);
}

const SUBTITLE_WORK_DIR = path.join(os.tmpdir(), "recordly-share-subtitles");
const STALE_SUBTITLE_COPY_MS = 6 * 60 * 60 * 1000;

/** Copies left by a run the app quit during would otherwise stay until macOS cleans temp. */
async function removeStaleSubtitleCopies() {
	const names = await fs.readdir(SUBTITLE_WORK_DIR).catch(() => []);
	for (const name of names) {
		const filePath = path.join(SUBTITLE_WORK_DIR, name);
		const stat = await fs.stat(filePath).catch(() => null);
		if (stat && Date.now() - stat.mtimeMs > STALE_SUBTITLE_COPY_MS)
			await fs.rm(filePath, { force: true }).catch(() => undefined);
	}
}

async function postShareSubtitles(
	segments: ShareSubtitleSegment[],
	metadataUrl: URL,
	token: string,
) {
	const response = await fetch(metadataUrl, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
		body: JSON.stringify({ segments }),
		redirect: "error",
		signal: AbortSignal.timeout(60_000),
	});
	if (!response.ok) throw new Error(`Subtitle upload failed (${response.status})`);
}

async function publishShareSubtitles(videoPath: string, metadataUrl: URL, token: string) {
	// Work on a private copy: the share dialog deletes its temporary export when closed.
	const copyPath = path.join(
		SUBTITLE_WORK_DIR,
		`${crypto.randomUUID()}${path.extname(videoPath)}`,
	);
	try {
		await fs.mkdir(SUBTITLE_WORK_DIR, { recursive: true });
		await fs.copyFile(videoPath, copyPath, fsConstants.COPYFILE_FICLONE);
		void removeStaleSubtitleCopies();
		const segments = await createShareSubtitles(copyPath);
		if (!segments) return;
		await postShareSubtitles(segments, metadataUrl, token);
	} catch (error) {
		console.warn("Shared video subtitles unavailable:", error);
	} finally {
		await fs.rm(copyPath, { force: true }).catch(() => undefined);
	}
}

type ShareCardProfile = { avatarDataUrl?: unknown; name?: unknown };

/** Composes and uploads the image link previews show; a share works without it. */
async function publishShareCard(
	origin: string,
	shareCode: string,
	token: string,
	title: string,
	poster: Buffer,
	profile: ShareCardProfile,
	signal: AbortSignal,
	shouldUpload: () => boolean = () => true,
) {
	try {
		const font = await fs.readFile(
			path.join(process.env.VITE_PUBLIC ?? "", "fonts", "InterDisplay-Medium.woff2"),
		);
		const card = await renderShareCard({
			title,
			poster,
			font,
			avatarDataUrl: typeof profile.avatarDataUrl === "string" ? profile.avatarDataUrl : null,
			name: typeof profile.name === "string" ? profile.name : "",
		});
		if (!shouldUpload()) return;
		const response = await fetch(new URL(`/api/upload-social/${shareCode}`, origin), {
			method: "PUT",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "image/jpeg",
				"content-length": String(card.length),
			},
			body: new Uint8Array(card),
			redirect: "error",
			signal,
		});
		if (!response.ok) throw new Error(`Link preview upload failed (${response.status})`);
	} catch (error) {
		console.warn("Link preview image unavailable:", error);
	}
}

const latestCardRefresh = new Map<string, number>();

/** Redraws the link preview with a new title, from the poster already online. */
export async function refreshShareCard(
	origin: string,
	shareCode: string,
	token: string,
	title: string,
	profile: ShareCardProfile,
) {
	// Quick successive renames: only the newest title may upload its preview.
	const run = (latestCardRefresh.get(shareCode) ?? 0) + 1;
	latestCardRefresh.set(shareCode, run);
	const isLatest = () => latestCardRefresh.get(shareCode) === run;
	try {
		const poster = await fetch(new URL(`/thumb/${shareCode}`, origin), {
			redirect: "error",
			signal: AbortSignal.timeout(30000),
		});
		// Password-protected posters aren't public; their previews show no image.
		if (!poster.ok || !isLatest()) return;
		await publishShareCard(
			origin,
			shareCode,
			token,
			title,
			Buffer.from(await poster.arrayBuffer()),
			profile,
			AbortSignal.timeout(60000),
			isLatest,
		);
	} catch (error) {
		console.warn("Link preview not refreshed:", error);
	} finally {
		if (isLatest()) latestCardRefresh.delete(shareCode);
	}
}

export function registerCloudShareHandlers() {
	ipcMain.handle(
		"cloud-share-manage",
		async (
			_event,
			input: {
				endpoint?: unknown;
				token?: unknown;
				action?: unknown;
				shareCode?: unknown;
				title?: unknown;
				avatarDataUrl?: unknown;
				name?: unknown;
			},
		) => {
			try {
				const endpoint = normalizeCloudEndpoint(input?.endpoint);
				if (
					typeof input.token !== "string" ||
					!input.token ||
					Buffer.byteLength(input.token) > MAX_AUTH_TOKEN_BYTES
				)
					throw new Error("Sign in to manage shared recordings.");
				if (
					input.action !== "list" &&
					input.action !== "delete" &&
					input.action !== "rename"
				)
					throw new Error("Invalid recording action.");
				if (
					input.action !== "list" &&
					(typeof input.shareCode !== "string" ||
						!/^[a-z0-9]{1,128}$/.test(input.shareCode))
				)
					throw new Error("Invalid recording ID.");
				const title =
					typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
				if (input.action === "rename" && !title)
					throw new Error("Enter a name for the recording.");
				const response = await fetch(
					new URL(
						input.action === "list"
							? "/api/videos"
							: `/api/${input.action}/${input.shareCode}`,
						endpoint,
					),
					{
						method: { list: "GET", delete: "DELETE", rename: "POST" }[input.action],
						headers: {
							authorization: `Bearer ${input.token}`,
							...(input.action === "rename"
								? { "content-type": "application/json" }
								: {}),
						},
						...(input.action === "rename" ? { body: JSON.stringify({ title }) } : {}),
						redirect: "error",
						signal: AbortSignal.timeout(30000),
					},
				);
				if (!response.ok)
					throw new Error(
						await responseError(response, "Could not manage shared recordings"),
					);
				if (input.action === "rename" && typeof input.shareCode === "string")
					void refreshShareCard(
						new URL(endpoint).origin,
						input.shareCode,
						input.token,
						title,
						input,
					);
				if (input.action !== "list") return { success: true };
				return {
					success: true,
					videos: parseCloudRecordingList(await readJsonResponse(response), endpoint),
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle(
		"cloud-share-upload",
		async (
			event,
			input: {
				filePath?: unknown;
				endpoint?: unknown;
				token?: unknown;
				title?: unknown;
				notes?: unknown;
				uploadId?: unknown;
				subtitles?: unknown;
				/** The editor's captions; used for the subtitles instead of transcribing. */
				captionCues?: unknown;
				avatarDataUrl?: unknown;
				name?: unknown;
			},
		) => {
			let uploadId: string | undefined;
			try {
				const endpoint = normalizeCloudEndpoint(input?.endpoint);
				if (typeof input?.filePath !== "string" || input.filePath.trim().length === 0) {
					throw new Error("Export a video before sharing it.");
				}
				uploadId =
					typeof input.uploadId === "string" && /^[a-f0-9-]{36}$/i.test(input.uploadId)
						? input.uploadId
						: crypto.randomUUID();
				const controller = new AbortController();
				activeUploads.set(uploadId, controller);
				const requestedPath = path.resolve(input.filePath);
				const resolvedPath = await fs.realpath(requestedPath);
				const isRecordlyExport =
					isOwnedExportPath(requestedPath) || isOwnedExportPath(resolvedPath);
				if (!isRecordlyExport && !isAllowedLocalReadPath(resolvedPath)) {
					throw new Error("This file is outside SuperShare's approved media locations.");
				}
				const stat = await fs.stat(resolvedPath);
				if (!stat.isFile()) throw new Error("The exported video could not be found.");
				const title =
					(typeof input.title === "string" ? input.title.trim().slice(0, 200) : "") ||
					path.basename(resolvedPath, path.extname(resolvedPath));
				const notes =
					typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : "";

				const token = typeof input.token === "string" ? input.token.trim() : "";
				if (!token || Buffer.byteLength(token) > MAX_AUTH_TOKEN_BYTES) {
					throw new Error("Sign in to SuperShare before creating a shared link.");
				}
				const controlHeaders: Record<string, string> = {
					"content-type": "application/json",
				};
				if (token) controlHeaders.authorization = `Bearer ${token}`;
				// The share page sizes its player from these; an unreadable file still uploads.
				const videoInfo = await probeNativeVideoMetadata(
					getFfmpegBinaryPath(),
					resolvedPath,
					controller.signal,
				).catch(() => null);
				const ticketResponse = await fetch(endpoint, {
					method: "POST",
					headers: controlHeaders,
					body: JSON.stringify({
						name: path.basename(resolvedPath),
						title,
						fileSize: stat.size,
						notes,
						size: stat.size,
						contentType: contentTypeFor(resolvedPath),
						width: videoInfo?.width ?? 0,
						height: videoInfo?.height ?? 0,
						duration: videoInfo?.duration ?? 0,
					}),
					redirect: "error",
					signal: controller.signal,
				});
				const ticketBody = await readJsonResponse(ticketResponse);
				if (!ticketResponse.ok) {
					const message =
						ticketBody && typeof ticketBody === "object" && "error" in ticketBody
							? String((ticketBody as { error: unknown }).error)
							: `Cloud share request failed (${ticketResponse.status}).`;
					throw new Error(message);
				}
				const ticket = parseCloudShareTicket(ticketBody);
				const endpointOrigin = new URL(endpoint).origin;
				if (new URL(ticket.shareUrl).origin !== endpointOrigin) {
					throw new Error("The share service returned an untrusted viewing URL.");
				}
				if (ticket.finalizeUrl && new URL(ticket.finalizeUrl).origin !== endpointOrigin) {
					throw new Error("The share service returned an untrusted finalization URL.");
				}
				const contentType = contentTypeFor(resolvedPath);
				const sendProgress = (uploadedBytes: number) => {
					if (event.sender.isDestroyed()) return;
					event.sender.send("cloud-share-progress", {
						uploadId,
						uploadedBytes,
						totalBytes: stat.size,
					});
				};
				const canUseMultipart =
					stat.size > MULTIPART_THRESHOLD_BYTES &&
					ticket.shareCode !== undefined &&
					new URL(ticket.uploadUrl).origin === endpointOrigin;

				if (canUseMultipart) {
					await uploadMultipart({
						endpoint,
						shareCode: ticket.shareCode as string,
						filePath: resolvedPath,
						fileSize: stat.size,
						contentType,
						token,
						signal: controller.signal,
						onProgress: sendProgress,
					});
				} else {
					let uploaded = 0;
					const progress = new Transform({
						transform(chunk, _encoding, callback) {
							uploaded += chunk.length;
							sendProgress(uploaded);
							callback(null, chunk);
						},
					});
					const source = createReadStream(resolvedPath);
					const body = source.pipe(progress);
					source.on("error", (error) => body.destroy(error));
					const uploadHeaders: Record<string, string> = {
						"content-type": contentType,
						"content-length": String(stat.size),
						...ticket.headers,
					};
					if (new URL(ticket.uploadUrl).origin === endpointOrigin) {
						uploadHeaders.authorization = `Bearer ${token}`;
					}
					try {
						const uploadResponse = await fetch(ticket.uploadUrl, {
							method: "PUT",
							headers: uploadHeaders,
							body: body as unknown as BodyInit,
							duplex: "half",
							redirect: "error",
							signal: controller.signal,
						} as RequestInit & { duplex: "half" });
						if (!uploadResponse.ok) {
							throw new Error(
								await responseError(uploadResponse, "Video upload failed"),
							);
						}
					} finally {
						body.destroy();
						source.destroy();
					}
				}

				if (ticket.finalizeUrl) {
					const finalizeHeaders: Record<string, string> = {
						"content-type": "application/json",
					};
					if (token && new URL(ticket.finalizeUrl).origin === new URL(endpoint).origin) {
						finalizeHeaders.authorization = `Bearer ${token}`;
					}
					const finalizeResponse = await fetch(ticket.finalizeUrl, {
						method: "POST",
						headers: finalizeHeaders,
						body: JSON.stringify({
							title,
							summary: notes,
						}),
						redirect: "error",
						signal: controller.signal,
					});
					if (!finalizeResponse.ok) {
						throw new Error(
							`Cloud share finalization failed (${finalizeResponse.status}).`,
						);
					}
				}
				if (ticket.shareCode) {
					try {
						const thumbnail = await createShareThumbnail(
							resolvedPath,
							controller.signal,
						);
						const response = await fetch(
							new URL(`/api/upload-thumbnail/${ticket.shareCode}`, endpointOrigin),
							{
								method: "PUT",
								headers: {
									authorization: `Bearer ${token}`,
									"content-type": "image/jpeg",
									"content-length": String(thumbnail.length),
								},
								body: new Uint8Array(thumbnail),
								redirect: "error",
								signal: controller.signal,
							},
						);
						if (!response.ok)
							throw new Error(`Thumbnail upload failed (${response.status})`);
						await publishShareCard(
							endpointOrigin,
							ticket.shareCode,
							token,
							title,
							thumbnail,
							input,
							controller.signal,
						);
					} catch {
						// The recording is already published. Older/missing posters use the
						// video's first frame in the library instead of failing the share.
						console.warn(
							"Shared video poster unavailable; using video preview fallback.",
						);
					}
				}

				if (ticket.shareCode && input.subtitles === true) {
					const metadataUrl = new URL(
						`/api/metadata/${ticket.shareCode}`,
						endpointOrigin,
					);
					const editorSegments = parseEditorCaptionSegments(input.captionCues);
					if (editorSegments) {
						// Captions written or corrected in the editor become the subtitles as they are.
						void postShareSubtitles(editorSegments, metadataUrl, token).catch((error) =>
							console.warn("Shared video subtitles unavailable:", error),
						);
					} else {
						// The link is ready now; subtitles follow once the speech model finishes.
						void publishShareSubtitles(resolvedPath, metadataUrl, token);
					}
				}

				return { success: true, uploadId, shareUrl: ticket.shareUrl };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					uploadId,
					canceled: message.includes("aborted"),
					error: message,
				};
			} finally {
				if (uploadId) activeUploads.delete(uploadId);
			}
		},
	);

	// Publish the owner's name and photo shown on share pages.
	ipcMain.handle(
		"cloud-share-profile",
		async (
			_event,
			input: { endpoint?: unknown; token?: unknown; name?: unknown; avatarDataUrl?: unknown },
		) => {
			try {
				const endpoint = normalizeCloudEndpoint(input?.endpoint);
				if (typeof input.token !== "string" || !input.token)
					throw new Error("Share service isn't set up.");
				const response = await fetch(new URL("/api/profile", endpoint), {
					method: "POST",
					headers: {
						authorization: `Bearer ${input.token}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: typeof input.name === "string" ? input.name : "",
						avatarDataUrl:
							typeof input.avatarDataUrl === "string" ? input.avatarDataUrl : null,
					}),
					redirect: "error",
					signal: AbortSignal.timeout(30000),
				});
				if (!response.ok)
					throw new Error(await responseError(response, "Could not update share links"));
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Shared videos are public by link; save a copy to Downloads and reveal it.
	ipcMain.handle(
		"cloud-share-download",
		async (_event, input: { endpoint?: unknown; shareCode?: unknown; title?: unknown }) => {
			let targetPath: string | undefined;
			try {
				const endpoint = normalizeCloudEndpoint(input?.endpoint);
				if (
					typeof input.shareCode !== "string" ||
					!/^[a-z0-9]{1,128}$/.test(input.shareCode)
				)
					throw new Error("Invalid recording ID.");
				const response = await fetch(new URL(`/v/${input.shareCode}`, endpoint), {
					redirect: "error",
				});
				if (!response.ok || !response.body)
					throw new Error(`Download failed (${response.status}).`);
				const baseName =
					(typeof input.title === "string" ? input.title : "")
						.replace(/[\\/:*?"<>|]/g, " ")
						.replace(/\p{Cc}/gu, " ")
						.trim()
						.slice(0, 120) || "SuperShare recording";
				const downloads = app.getPath("downloads");
				targetPath = path.join(downloads, `${baseName}.mp4`);
				for (let index = 2; await fileExists(targetPath); index += 1) {
					targetPath = path.join(downloads, `${baseName} ${index}.mp4`);
				}
				const file = await fs.open(targetPath, "wx");
				try {
					for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
						await file.write(chunk);
					}
				} finally {
					await file.close();
				}
				shell.showItemInFolder(targetPath);
				return { success: true, path: targetPath };
			} catch (error) {
				if (targetPath) await fs.rm(targetPath, { force: true }).catch(() => undefined);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle("cloud-share-cancel", (_event, uploadId: unknown) => {
		if (typeof uploadId !== "string") return { success: false };
		const controller = activeUploads.get(uploadId);
		if (!controller) return { success: false };
		controller.abort();
		return { success: true };
	});
}
