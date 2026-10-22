import { useRef, useState, type FormEvent } from "react";
import { TextField, Label, Input } from "@heroui/react";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
	CLOUD_SHARE_ENDPOINT,
	CLOUD_SHARE_PERSONAL_TOKEN,
} from "@/components/video-editor/cloud/endpoint";
import { createAvatarDataUrl, saveLocalProfile, useLocalProfile } from "@/lib/localProfile";

/** Name and photo for a build without sign-in; also published to the personal share service. */
export function LocalProfileSettings() {
	const profile = useLocalProfile();
	const [name, setName] = useState(profile.name);
	const [avatarDataUrl, setAvatarDataUrl] = useState(profile.avatarDataUrl);
	const [busy, setBusy] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const changed = name.trim() !== profile.name || avatarDataUrl !== profile.avatarDataUrl;

	const pickPhoto = async (file: File | undefined) => {
		if (!file) return;
		try {
			setAvatarDataUrl(await createAvatarDataUrl(file));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		try {
			const next = { name: name.trim(), avatarDataUrl };
			if (!saveLocalProfile(next)) throw new Error("Could not save your profile.");
			const publish = window.electronAPI?.cloudShareProfile;
			if (publish && CLOUD_SHARE_PERSONAL_TOKEN && CLOUD_SHARE_ENDPOINT) {
				const result = await publish({
					endpoint: CLOUD_SHARE_ENDPOINT,
					token: CLOUD_SHARE_PERSONAL_TOKEN,
					...next,
				});
				if (!result.success) {
					toast.warning(`Saved here, but share links weren't updated: ${result.error}`);
					return;
				}
			}
			toast.success("Profile saved");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit} className="space-y-5" aria-label="Profile settings">
			<div className="flex min-w-0 items-center gap-4">
				<AccountAvatar
					user={null}
					label={name.trim() || undefined}
					className="!size-16"
					key={avatarDataUrl ?? "no-photo"}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={() => fileInput.current?.click()}
					>
						{avatarDataUrl ? "Change photo" : "Upload photo"}
					</Button>
					{avatarDataUrl && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={() => setAvatarDataUrl(null)}
						>
							Remove
						</Button>
					)}
				</div>
				<input
					ref={fileInput}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/heic"
					className="hidden"
					aria-label="Profile photo"
					onChange={(event) => {
						void pickPhoto(event.target.files?.[0]);
						event.target.value = "";
					}}
				/>
			</div>
			<TextField name="displayName" value={name} onChange={setName} isDisabled={busy}>
				<Label>Your name</Label>
				<Input maxLength={80} autoComplete="name" className="w-full" />
			</TextField>
			<p className="text-xs leading-relaxed text-muted">
				Shown on your dashboard cards and on your share links.
			</p>
			<Button type="submit" variant="secondary" size="sm" disabled={busy || !changed}>
				{busy ? "Saving…" : "Save profile"}
			</Button>
		</form>
	);
}
