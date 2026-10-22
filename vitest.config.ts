import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Keep personal settings from a developer's .env.local out of test results.
		env: { VITE_CLOUD_SHARE_SECRET: "", VITE_CLOUD_SHARE_ENDPOINT: "", VITE_PROFILE_NAME: "" },
		include: [
			"src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
			"electron/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
		],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
});
