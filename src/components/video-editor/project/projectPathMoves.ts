import { moveProjectShareLink } from "../cloud/projectShareLinks";
import { moveProjectFolderReferences } from "../dashboard/useProjectFolders";

/** Keeps dashboard folders and share links on projects the app moved into their own folders. */
export function followProjectPathMoves(moves: Record<string, string>) {
	for (const [previous, next] of Object.entries(moves)) {
		try {
			moveProjectFolderReferences(previous, next);
			moveProjectShareLink(previous, next);
		} catch (error) {
			console.warn("Could not follow a moved project:", error);
		}
	}
}
