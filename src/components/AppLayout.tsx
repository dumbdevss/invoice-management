"use client"

import { Button, Icon, Layout } from "@stellar/design-system"
import Link from "next/link"
import { usePathname } from "next/navigation"
import "../App.css"
import { labPrefix } from "../contracts/util"
import ConnectAccount from "./ConnectAccount"

interface AppLayoutProps {
	children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
	const pathname = usePathname()
	const isHomeActive = pathname === "/"
	const isDashActive = pathname === "/dashboard"

	return (
		<div className="AppLayout">
			<Layout.Header
				projectId="StellarPay"
				projectTitle="StellarPay"
				hasThemeSwitch={true}
				contentCenter={
					<>
						<Link href="/">
							<Button variant="tertiary" size="md" disabled={isHomeActive}>
								<Icon.PlusCircle size="md" />
								Create invoice
							</Button>
						</Link>
						<Link href="/dashboard">
							<Button variant="tertiary" size="md" disabled={isDashActive}>
								<Icon.LayoutAlt03 size="md" />
								Dashboard
							</Button>
						</Link>
						<Link href={labPrefix()} target="_blank">
							<Button variant="tertiary" size="md">
								<Icon.SearchMd size="md" />
								Transaction Explorer
							</Button>
						</Link>
					</>
				}
				contentRight={<ConnectAccount />}
			/>

			<main>
				<Layout.Content>
					<Layout.Inset>{children}</Layout.Inset>
				</Layout.Content>
			</main>

			<Layout.Footer>
				<nav>
					<a
						href="https://github.com/theahaco/scaffold-stellar"
						className="Link Link--secondary"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Icon.GitPullRequest size="sm" /> GitHub
					</a>
					<a
						href="https://www.youtube.com/watch?v=0syGaIn3ULk&list=PLmr3tp_7-7Gjj6gn5-bBn-QTMyaWzwOU5"
						className="Link Link--secondary"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Icon.Youtube size="sm" /> Tutorial
					</a>
					<a
						href="https://scaffoldstellar.org"
						className="Link Link--secondary"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Icon.BookOpen01 size="sm" /> View docs
					</a>
				</nav>
			</Layout.Footer>
		</div>
	)
}

export default AppLayout
