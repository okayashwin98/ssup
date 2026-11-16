import { Avatar } from "@heroui/react";
import { type LocalProfile, useLocalProfile } from "@/lib/localProfile";

export function getAccountProfile(fallback?: string, localProfile?: LocalProfile) {
	const name = [
		fallback,
		// The local profile (or a personal build setting) names the user.
		localProfile?.name,
		import.meta.env.VITE_PROFILE_NAME,
		"Local profile",
	].find((value) => typeof value === "string" && value.trim()) as string;
	const initials = name
		.split("@")[0]
		.split(/[\s._-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
	const picture = localProfile?.avatarDataUrl ?? undefined;
	return { name, initials, picture };
}
export function AccountAvatar({
	label,
	className = "",
	picture,
}: {
	label?: string;
	className?: string;
	/** Overrides the profile photo, e.g. an unsaved pick; null shows initials. */
	picture?: string | null;
}) {
	const localProfile = useLocalProfile();
	const resolved = getAccountProfile(label, localProfile);
	const profile =
		picture === undefined ? resolved : { ...resolved, picture: picture ?? undefined };
	return (
		<Avatar
			aria-label={profile.name}
			className={`shrink-0 !rounded-full bg-accent/15 text-accent ${className}`}
		>
			{profile.picture && (
				<Avatar.Image
					src={profile.picture}
					alt={profile.name}
					className="!rounded-full object-cover"
				/>
			)}
			<Avatar.Fallback className="!rounded-full bg-accent/15 text-xs font-medium text-accent">
				{profile.initials}
			</Avatar.Fallback>
		</Avatar>
	);
}
