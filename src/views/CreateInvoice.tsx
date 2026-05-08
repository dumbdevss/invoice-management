"use client"

import { Button, Card, Icon, Input, Select } from "@stellar/design-system"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import {
	invoiceContract,
	newInvoiceId,
	toStroops,
	X402_SERVER_URL,
	x402,
	INVOICE_CONTRACT_ID,
} from "../lib/stellar"
import styles from "./CreateInvoice.module.css"

const CreateInvoice: React.FC = () => {
	const { address } = useWallet()
	const { addNotification } = useNotification()

	const [amount, setAmount] = useState("10")
	const [asset, setAsset] = useState("XLM")
	const [memo, setMemo] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [created, setCreated] = useState<{
		id: string
		payLink: string
	} | null>(null)

	const canSubmit = useMemo(() => {
		const n = Number(amount)
		return (
			!!address &&
			!!INVOICE_CONTRACT_ID &&
			!Number.isNaN(n) &&
			n > 0 &&
			!submitting
		)
	}, [address, amount, submitting])

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault()
		if (!address) {
			addNotification("Connect your wallet first.", "warning")
			return
		}
		if (!INVOICE_CONTRACT_ID) {
			addNotification(
				"Contract not configured. Run scripts/deploy-testnet.sh.",
				"error",
			)
			return
		}

		setSubmitting(true)
		try {
			const id = newInvoiceId()
			const amountStroops = toStroops(amount).toString()

			// 1. Sign + submit create_invoice on-chain
			await invoiceContract.createInvoice({
				id,
				creator: address,
				amountStroops,
				asset,
				memo,
			})

			// 2. Tell the off-chain x402 server (best-effort)
			let payLink = `${window.location.origin}/pay/${id}`
			try {
				const meta = await x402.createInvoiceMeta({
					id,
					amount,
					asset,
					memo,
					creatorAddress: address,
				})
				payLink = meta.payLink
			} catch {
				// server is optional — keep going
			}

			setCreated({ id, payLink })
			addNotification("Invoice created on Stellar testnet.", "success")
		} catch (err) {
			console.error(err)
			addNotification(
				err instanceof Error ? err.message : "Failed to create invoice",
				"error",
			)
		} finally {
			setSubmitting(false)
		}
	}

	function copyLink() {
		if (!created) return
		void navigator.clipboard.writeText(created.payLink)
		addNotification("Link copied to clipboard.", "success")
	}

	return (
		<div className={styles.CreateInvoice}>
			<div className={styles.hero}>
				<h1>Get paid on Stellar</h1>
				<p>
					Create a shareable invoice link. The recipient pays in seconds with
					their wallet — settled on-chain, no payment processor.
				</p>
			</div>

			<Card>
				<form onSubmit={handleCreate} className={styles.form}>
					<div className={styles.row}>
						<div className={styles.field}>
							<Input
								id="amount"
								fieldSize="md"
								label="Amount"
								type="number"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								min="0"
								step="0.0000001"
								placeholder="10"
							/>
						</div>
						<div className={styles.field}>
							<Select
								id="asset"
								fieldSize="md"
								label="Asset"
								value={asset}
								onChange={(e) => setAsset(e.target.value)}
							>
								<option value="XLM">XLM</option>
								<option value="USDC">USDC (coming soon)</option>
							</Select>
						</div>
					</div>

					<Input
						id="memo"
						fieldSize="md"
						label="Description / memo"
						type="text"
						value={memo}
						onChange={(e) => setMemo(e.target.value)}
						placeholder="Website redesign — April 2026"
					/>

					<div className={styles.actions}>
						<Button
							type="submit"
							variant="primary"
							size="md"
							disabled={!canSubmit}
							isLoading={submitting}
						>
							<Icon.Send01 size="md" />
							Create invoice
						</Button>
						{!address && (
							<span className={styles.hint}>Connect your wallet to begin.</span>
						)}
						{!INVOICE_CONTRACT_ID && (
							<span className={styles.hint}>
								Set NEXT_PUBLIC_INVOICE_CONTRACT_ID after deploying the
								contract.
							</span>
						)}
					</div>
				</form>
			</Card>

			{created && (
				<Card>
					<h2>
						<Icon.LinkExternal01 size="lg" />
						Share this link
					</h2>
					<p className={styles.payLink}>{created.payLink}</p>
					<div className={styles.actions}>
						<Button variant="primary" size="md" onClick={copyLink}>
							<Icon.Copy01 size="md" />
							Copy link
						</Button>
						<Link href={`/pay/${created.id}`}>
							<Button variant="secondary" size="md">
								<Icon.ArrowRight size="md" />
								Open pay page
							</Button>
						</Link>
					</div>
				</Card>
			)}

			<section className={styles.howItWorks}>
				<Card>
					<Icon.Wallet01 size="lg" />
					<h3>1. Connect</h3>
					<p>Connect your Freighter (or any) Stellar wallet on testnet.</p>
				</Card>
				<Card>
					<Icon.File06 size="lg" />
					<h3>2. Create</h3>
					<p>
						Fill in amount, asset, and a memo. Sign one transaction to record
						the invoice on Soroban.
					</p>
				</Card>
				<Card>
					<Icon.Send01 size="lg" />
					<h3>3. Share & get paid</h3>
					<p>
						Copy the link. Anyone can pay in seconds — settlement is on-chain
						via the x402 protocol{" "}
						{X402_SERVER_URL ? `(server: ${X402_SERVER_URL})` : ""}.
					</p>
				</Card>
			</section>
		</div>
	)
}

export default CreateInvoice
