import path from "node:path"
import { type NextConfig } from "next"

const nextConfig: NextConfig = {
	images: {
		unoptimized: true,
	},
	serverExternalPackages: ["@stellar/stellar-sdk", "@stellar/stellar-base"],
	webpack: (config) => {
		// The CJS bundle of @stellar/design-system uses Node-style directory
		// imports which webpack/Next can't resolve under strict ESM. Force the
		// ESM bundle instead.
		config.resolve = config.resolve || {}
		config.resolve.alias = {
			...(config.resolve.alias || {}),
			"@stellar/design-system$": path.resolve(
				process.cwd(),
				"node_modules/@stellar/design-system/build/index.esm.js",
			),
		}
		return config
	},
	async rewrites() {
		return [
			{
				source: "/friendbot",
				destination: "http://localhost:8000/friendbot",
			},
		]
	},
}

export default nextConfig
