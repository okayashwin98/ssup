import path from "node:path";

/** Project files save as `<name>.ssup`; the older extensions still open. */
export const PROJECT_FILE_EXTENSION = "ssup";
export const LEGACY_PROJECT_FILE_EXTENSIONS = ["recordly", "openscreen"];
/** The shared folder projects used to save in, read until they are moved out. */
export const PROJECTS_DIRECTORY_NAME = "Projects";

export function hasProjectFileExtension(filePath: string) {
	const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();
	return [PROJECT_FILE_EXTENSION, ...LEGACY_PROJECT_FILE_EXTENSIONS].includes(extension);
}
