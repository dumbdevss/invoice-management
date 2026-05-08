import { type Metadata } from "next"
import { Providers } from "./providers"
import "@stellar/design-system/build/styles.min.css"
import "@/index.css"

export const metadata: Metadata = {
	title: "StellarPay — Decentralized Invoice & Payment System",
	description:
		"Create and pay invoices on the Stellar blockchain with a single shareable link",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin="anonymous"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Inconsolata:wght@500&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
