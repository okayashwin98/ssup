// electron-builder afterSign hook: refuse a Mac build signed without a certificate.
// macOS keeps Screen Recording, Accessibility and Microphone permission for a
// certificate-signed app across updates; one signed without looks like a new app after
// every rebuild, so those permissions would have to be granted again.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function requireCertificateSignature(context) {
	if (context.electronPlatformName !== "darwin") return;
	const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
	const result = spawnSync("codesign", ["-dv", appPath], { encoding: "utf8" });
	const info = `${result.stdout}${result.stderr}`;
	const team = /TeamIdentifier=(.+)/.exec(info)?.[1]?.trim();
	if (result.status !== 0 || /Signature=adhoc/.test(info) || !team || team === "not set") {
		throw new Error(
			`${appPath} was signed without a certificate. Build with the Apple Development ` +
				"certificate in your keychain (do not set CSC_IDENTITY_AUTO_DISCOVERY=false), " +
				"so macOS keeps SuperShare's permissions after installing.",
		);
	}
};
