import { Avatar } from "@heroui/react";
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import { type LocalProfile, useLocalProfile } from "@/lib/localProfile";

export const AccountProfileContext = createContext<User | null>(null);
export function getAccountProfile(
	user: User | null,
	fallback?: string,
	localProfile?: LocalProfile,
) {
	const metadata = user?.user_metadata;
	const local = user ? undefined : localProfile;
	const name = [
		metadata?.full_name,
		metadata?.name,
		user?.email,
		fallback,
		// Without an account, the local profile (or a personal build setting) names the user.
		local?.name,
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
	const picture =
		[metadata?.avatar_url, metadata?.picture].find(
			(value) => typeof value === "string" && /^https?:\/\//.test(value),
		) ??
		local?.avatarDataUrl ??
		undefined;
	return { name, initials, picture };
}
export function AccountAvatar({
	label,
	className = "",
	user,
	picture,
}: {
	label?: string;
	className?: string;
	user?: User | null;
	/** Overrides the profile photo, e.g. an unsaved pick; null shows initials. */
	picture?: string | null;
}) {
	const context = useContext(AccountProfileContext);
	const localProfile = useLocalProfile();
	const resolved = getAccountProfile(user === undefined ? context : user, label, localProfile);
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
