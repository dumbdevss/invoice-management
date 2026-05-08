"use client"

import { Button, Card, Icon, Loader } from "@stellar/design-system"
import { useEffect, useState } from "react"
import { stellarNetwork } from "../contracts/util"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import {
	type Invoice,
	invoiceContract,
	payInvoiceXLM,
	x402,
} from "../lib/stellar"
import styles from "./PayInvoice.module.css"

interface PayInvoiceProps {
	id: string
}

const PayInvoice: React.FC<PayInvoiceProps> = ({ id }) => {
	const { address } = useWallet()
	const { addNotification } = useNotification()
	const [invoice, setInvoice] = useState<Invoice | null>(null)
	const [loading, setLoading] = useState(true)
	const [paying, setPaying] = useState(false)
	const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const reload = async () => {
		setLoading(true)
		setError(null)
		try {
			// Try x402 server first; fall back to direct chain read.
			try {
				const inv = await x402.getInvoice(id)
				setInvoice(inv)
			} catch {
				const reader =
					address || "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQGPO"
				const inv = await invoiceContract.getInvoice(id, reader)
				if (!inv) throw new Error("Invoice not found")
				setInvoice(inv)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load invoice")
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void reload()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id])

	async function handlePay() {
		if (!invoice || !address) return
		setPaying(true)
		try {
			// 1. Initiate x402 challenge (informational; server is optional)
			try {
				await x402.fetchPaymentChallenge(id)
			} catch {
				/* server optional */
			}

			// 2. Send the on-chain payment to the creator
			const txHash = await payInvoiceXLM({
				payer: address,
				destination: invoice.creator,
				amountHuman: invoice.amountHuman,
				memo: id.slice(0, 28),
			})
			setPaymentTxHash(txHash)
			addNotification("Payment sent. Marking invoice paid…", "primary")

			// 3. Mark the invoice paid on-chain
			await invoiceContract.markPaid({
				id,
				payer: address,
				paidAmountStroops: invoice.amount,
			})

			// 4. Tell the x402 server to settle (best-effort)
			try {
				await x402.settle(id, txHash)
			} catch {
				/* optional */
			}

			addNotification("Invoice paid successfully!", "success")
			await reload()
		} catch (err) {
			console.error(err)
			addNotification(
				err instanceof Error ? err.message : "Payment failed",
				"error",
			)
		} finally {
			setPaying(false)
		}
	}

	if (loading) {
		return (
			<div className={styles.PayInvoice}>
				<Card>
					<div className={styles.center}>
						<Loader size="2rem" />
						<p>Loading invoice…</p>
					</div>
				</Card>
			</div>
		)
	}

	if (error || !invoice) {
		return (
			<div className={styles.PayInvoice}>
				<Card>
					<div className={styles.center}>
						<Icon.AlertTriangle size="lg" />
						<h2>Invoice not available</h2>
						<p>{error || "The invoice could not be found."}</p>
					</div>
				</Card>
			</div>
		)
	}

	const isPaid = invoice.status === "paid"
	const isCancelled = invoice.status === "cancelled"
	const explorerBase =
		stellarNetwork === "PUBLIC"
			? "https://stellar.expert/explorer/public"
			: "https://stellar.expert/explorer/testnet"

	return (
		<div className={styles.PayInvoice}>
			<Card>
				<div className={styles.header}>
					<div>
						<span className={styles.label}>Invoice</span>
						<h1>{invoice.id}</h1>
					</div>
					<span className={`${styles.badge} ${styles[invoice.status]}`}>
						{invoice.status.toUpperCase()}
					</span>
				</div>

				<div className={styles.amount}>
					<span className={styles.big}>{invoice.amountHuman}</span>
					<span className={styles.asset}>{invoice.asset}</span>
				</div>

				{invoice.memo && (
					<p className={styles.memo}>&ldquo;{invoice.memo}&rdquo;</p>
				)}

				<div className={styles.meta}>
					<div>
						<span className={styles.label}>To (creator)</span>
						<a
							className={styles.mono}
							href={`${explorerBase}/account/${invoice.creator}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							{shorten(invoice.creator)}
						</a>
					</div>
					{invoice.payer && (
						<div>
							<span className={styles.label}>Paid by</span>
							<a
								className={styles.mono}
								href={`${explorerBase}/account/${invoice.payer}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								{shorten(invoice.payer)}
							</a>
						</div>
					)}
					<div>
						<span className={styles.label}>Created</span>
						<span>{new Date(invoice.createdAt * 1000).toLocaleString()}</span>
					</div>
					{invoice.paidAt && (
						<div>
							<span className={styles.label}>Paid</span>
							<span>{new Date(invoice.paidAt * 1000).toLocaleString()}</span>
						</div>
					)}
					{(paymentTxHash || invoice.txHash) && (
						<div>
							<span className={styles.label}>Transaction</span>
							<a
								className={styles.mono}
								href={`${explorerBase}/tx/${paymentTxHash || invoice.txHash}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								{shorten(paymentTxHash || invoice.txHash || "")}
							</a>
						</div>
					)}
				</div>

				<div className={styles.actions}>
					{isPaid ? (
						<div className={styles.paidBanner}>
							<Icon.CheckCircle size="lg" />
							<span>This invoice has been paid.</span>
						</div>
					) : isCancelled ? (
						<div className={styles.cancelledBanner}>
							<Icon.XCircle size="lg" />
							<span>This invoice was cancelled.</span>
						</div>
					) : !address ? (
						<p className={styles.hint}>
							Connect your wallet to pay this invoice.
						</p>
					) : address === invoice.creator ? (
						<p className={styles.hint}>
							You are the creator of this invoice — share the link with the
							payer.
						</p>
					) : (
						<Button
							variant="primary"
							size="md"
							onClick={() => void handlePay()}
							isLoading={paying}
							disabled={paying}
						>
							<Icon.CreditCard01 size="md" />
							Pay {invoice.amountHuman} {invoice.asset}
						</Button>
					)}
				</div>
			</Card>
		</div>
	)
}

function shorten(s: string, head = 6, tail = 6): string {
	if (s.length <= head + tail) return s
	return `${s.slice(0, head)}…${s.slice(-tail)}`
}

export default PayInvoice
