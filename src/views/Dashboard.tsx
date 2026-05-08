"use client"

import { Button, Card, Icon, Loader } from "@stellar/design-system"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import { type Invoice, invoiceContract, x402 } from "../lib/stellar"
import styles from "./Dashboard.module.css"

const Dashboard: React.FC = () => {
	const { address } = useWallet()
	const { addNotification } = useNotification()
	const [invoices, setInvoices] = useState<Invoice[]>([])
	const [loading, setLoading] = useState(false)
	const [cancellingId, setCancellingId] = useState<string | null>(null)

	const reload = async () => {
		if (!address) return
		setLoading(true)
		try {
			let list: Invoice[] = []
			try {
				list = await x402.listByCreator(address)
			} catch {
				const ids = await invoiceContract.getCreatorInvoices(address, address)
				const fetched = await Promise.all(
					ids.map((id) => invoiceContract.getInvoice(id, address)),
				)
				list = fetched.filter((i): i is Invoice => i !== null)
			}
			list.sort((a, b) => b.createdAt - a.createdAt)
			setInvoices(list)
		} catch (err) {
			console.error(err)
			addNotification(
				err instanceof Error ? err.message : "Failed to load invoices",
				"error",
			)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void reload()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [address])

	async function handleCancel(id: string) {
		if (!address) return
		setCancellingId(id)
		try {
			await invoiceContract.cancelInvoice({ id, creator: address })
			addNotification("Invoice cancelled.", "success")
			await reload()
		} catch (err) {
			addNotification(
				err instanceof Error ? err.message : "Cancel failed",
				"error",
			)
		} finally {
			setCancellingId(null)
		}
	}

	function copyLink(invoice: Invoice) {
		const link =
			invoice.payLink ?? `${window.location.origin}/pay/${invoice.id}`
		void navigator.clipboard.writeText(link)
		addNotification("Link copied.", "success")
	}

	if (!address) {
		return (
			<div className={styles.Dashboard}>
				<Card>
					<div className={styles.empty}>
						<Icon.Wallet01 size="lg" />
						<h2>Connect your wallet</h2>
						<p>Sign in with your Stellar wallet to view your invoices.</p>
					</div>
				</Card>
			</div>
		)
	}

	return (
		<div className={styles.Dashboard}>
			<div className={styles.headerRow}>
				<div>
					<h1>Your invoices</h1>
					<p className={styles.subtitle}>
						Address: <code>{address}</code>
					</p>
				</div>
				<Link href="/">
					<Button variant="primary" size="md">
						<Icon.PlusCircle size="md" />
						New invoice
					</Button>
				</Link>
			</div>

			{loading ? (
				<Card>
					<div className={styles.empty}>
						<Loader size="2rem" />
						<p>Loading…</p>
					</div>
				</Card>
			) : invoices.length === 0 ? (
				<Card>
					<div className={styles.empty}>
						<Icon.File06 size="lg" />
						<h2>No invoices yet</h2>
						<p>Create your first invoice to get started.</p>
					</div>
				</Card>
			) : (
				<div className={styles.list}>
					{invoices.map((inv) => (
						<Card key={inv.id}>
							<div className={styles.row}>
								<div className={styles.left}>
									<span className={`${styles.badge} ${styles[inv.status]}`}>
										{inv.status.toUpperCase()}
									</span>
									<div>
										<div className={styles.id}>{inv.id}</div>
										<div className={styles.amt}>
											{inv.amountHuman} {inv.asset}
										</div>
										{inv.memo && <div className={styles.memo}>{inv.memo}</div>}
										<div className={styles.date}>
											{new Date(inv.createdAt * 1000).toLocaleString()}
										</div>
									</div>
								</div>
								<div className={styles.right}>
									<Link href={`/pay/${inv.id}`}>
										<Button variant="tertiary" size="sm">
											<Icon.ArrowRight size="sm" />
											Open
										</Button>
									</Link>
									<Button
										variant="tertiary"
										size="sm"
										onClick={() => copyLink(inv)}
									>
										<Icon.Copy01 size="sm" />
										Copy link
									</Button>
									{inv.status === "pending" && (
										<Button
											variant="error"
											size="sm"
											onClick={() => void handleCancel(inv.id)}
											isLoading={cancellingId === inv.id}
											disabled={cancellingId === inv.id}
										>
											<Icon.XClose size="sm" />
											Cancel
										</Button>
									)}
								</div>
							</div>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}

export default Dashboard
