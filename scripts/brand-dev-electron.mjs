// In development macOS names the app after the stock Electron bundle; give it this app's name.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

if (process.platform !== "darwin") process.exit(0);
const { productName } = JSON.parse(readFileSync("package.json", "utf8"));
const app = path.resolve("node_modules/electron/dist/Electron.app");
const plist = path.join(app, "Contents/Info.plist");
if (!existsSync(plist)) process.exit(0);

const read = (key) =>
	spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], {
		encoding: "utf8",
	}).stdout.trim();
if (read("CFBundleName") === productName && read("CFBundleDisplayName") === productName)
	process.exit(0);

for (const key of ["CFBundleName", "CFBundleDisplayName"])
	spawnSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${productName}`, plist], {
		stdio: "inherit",
	});
// Editing Info.plist breaks the bundle's ad-hoc signature; sign it again so macOS will launch it.
const signed = spawnSync("codesign", ["--force", "--deep", "--sign", "-", app], {
	stdio: "inherit",
});
if (signed.status !== 0) {
	console.error("[brand-dev-electron] Could not re-sign the development app after renaming it.");
	process.exit(1);
}
spawnSync(
	"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
	["-f", app],
	{ stdio: "inherit" },
);
console.log(`[brand-dev-electron] Development app is named ${productName}.`);
