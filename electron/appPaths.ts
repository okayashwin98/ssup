import path from "node:path";
import { app } from "electron";

if (process.env["VITE_DEV_SERVER_URL"]) {
	const devUserDataPath = path.join(app.getPath("appData"), "Recordly-dev");
	app.setPath("userData", devUserDataPath);
	app.setPath("sessionData", path.join(devUserDataPath, "session"));
}

// Test exports get their own library, so they never add projects to the real one.
if (process.env["RECORDLY_SMOKE_EXPORT"] === "1") {
	const smokeUserDataPath =
		process.env["RECORDLY_SMOKE_USER_DATA_DIR"] ??
		path.join(app.getPath("temp"), "SuperShare-smoke-export");
	app.setPath("userData", smokeUserDataPath);
	app.setPath("sessionData", path.join(smokeUserDataPath, "session"));
}

export const USER_DATA_PATH = app.getPath("userData");
export const RECORDINGS_DIR = path.join(USER_DATA_PATH, "recordings");
