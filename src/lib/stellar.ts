/**
 * Frontend Stellar helpers for the StellarPay invoice system.
 *
 * - `invoiceContract` builds & signs Soroban contract calls (create, mark_paid, cancel)
 * - `payInvoiceXLM` constructs a regular Stellar XLM payment to the creator
 * - `x402` is a thin client over the x402-server REST endpoints
 */

import {
	Address,
	Asset,
	BASE_FEE,
	Contract,
	Horizon,
	Operation,
	TransactionBuilder,
	nativeToScVal,
	scValToNative,
	rpc as SorobanRpc,
	type xdr,
} from "@stellar/stellar-sdk"
import { networkPassphrase, rpcUrl, horizonUrl } from "../contracts/util"
import { wallet } from "../util/wallet"

// =================== Config ===================

export const INVOICE_CONTRACT_ID =
	process.env.NEXT_PUBLIC_INVOICE_CONTRACT_ID ?? ""

export const X402_SERVER_URL =
	process.env.NEXT_PUBLIC_X402_SERVER_URL ?? "http://localhost:4000"

const sorobanServer = new SorobanRpc.Server(rpcUrl, {
	allowHttp: rpcUrl.startsWith("http://"),
})
const horizon = new Horizon.Server(horizonUrl, {
	allowHttp: horizonUrl.startsWith("http://"),
})

// =================== Types ===================

export type InvoiceStatus = "pending" | "paid" | "cancelled"

export interface Invoice {
	id: string
	creator: string
	payer: string | null
	/** Amount in stroops, as a string (so JS doesn't lose precision). */
	amount: string
	/** "10.5" — the same amount in human units. */
	amountHuman: string
	/** "XLM" | "USDC" | a Stellar contract address */
	asset: string
	memo: string
	status: InvoiceStatus
	createdAt: number
	paidAt: number | null
	payLink?: string
	txHash?: string | null
}

// =================== Stroops helpers ===================

const STROOPS_PER_UNIT = 10_000_000n

export function toStroops(amount: string | number): bigint {
	const [whole, frac = ""] = String(amount).split(".")
	const fracPadded = (frac + "0000000").slice(0, 7)
	return BigInt(whole || "0") * STROOPS_PER_UNIT + BigInt(fracPadded || "0")
}

export function fromStroops(stroops: string | bigint | number): string {
	const n = typeof stroops === "bigint" ? stroops : BigInt(stroops)
	const whole = n / STROOPS_PER_UNIT
	const frac = n % STROOPS_PER_UNIT
	const trimmed = frac.toString().padStart(7, "0").replace(/0+$/, "")
	return trimmed ? `${whole}.${trimmed}` : `${whole}`
}

// =================== Contract helpers ===================

function requireContractId(): string {
	if (!INVOICE_CONTRACT_ID) {
		throw new Error(
			"NEXT_PUBLIC_INVOICE_CONTRACT_ID is not set. Run `scripts/deploy-testnet.sh` and copy the value into your .env.",
		)
	}
	return INVOICE_CONTRACT_ID
}

function statusFromScVal(raw: unknown): InvoiceStatus {
	if (typeof raw === "string") return raw.toLowerCase() as InvoiceStatus
	if (raw && typeof raw === "object" && "tag" in raw) {
		return String((raw as { tag: string }).tag).toLowerCase() as InvoiceStatus
	}
	return "pending"
}

function normaliseInvoice(raw: Record<string, unknown>, id: string): Invoice {
	const amount = String(raw.amount ?? "0")
	return {
		id: (raw.id as string) ?? id,
		creator: raw.creator as string,
		payer: (raw.payer as string | null) ?? null,
		amount,
		amountHuman: fromStroops(amount),
		asset: raw.asset as string,
		memo: (raw.memo as string) ?? "",
		status: statusFromScVal(raw.status),
		createdAt: Number(raw.created_at ?? raw.createdAt ?? 0),
		paidAt: raw.paid_at ? Number(raw.paid_at) : null,
	}
}

async function buildAndSign(
	op: xdr.Operation,
	publicKey: string,
): Promise<{ hash: string; result: unknown }> {
	const account = await sorobanServer.getAccount(publicKey)
	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase,
	})
		.addOperation(op)
		.setTimeout(60)
		.build()

	const prepared = await sorobanServer.prepareTransaction(tx)
	const xdrToSign = prepared.toXDR()

	const { signedTxXdr } = await wallet.signTransaction(xdrToSign, {
		networkPassphrase,
		address: publicKey,
	})

	const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase)
	const sendRes = await sorobanServer.sendTransaction(signedTx)

	if (sendRes.status === "ERROR") {
		throw new Error(`Send failed: ${JSON.stringify(sendRes)}`)
	}

	let getRes = await sorobanServer.getTransaction(sendRes.hash)
	const start = Date.now()
	while (getRes.status === "NOT_FOUND" && Date.now() - start < 30_000) {
		await new Promise((r) => setTimeout(r, 1500))
		getRes = await sorobanServer.getTransaction(sendRes.hash)
	}

	if (getRes.status !== "SUCCESS") {
		throw new Error(`Tx failed: ${JSON.stringify(getRes)}`)
	}

	let result: unknown = null
	if (getRes.returnValue) {
		try {
			result = scValToNative(getRes.returnValue)
		} catch {
			result = null
		}
	}
	return { hash: sendRes.hash, result }
}

async function simulateRead(
	op: xdr.Operation,
	publicKey: string,
): Promise<unknown> {
	const account = await sorobanServer.getAccount(publicKey)
	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase,
	})
		.addOperation(op)
		.setTimeout(30)
		.build()

	const sim = await sorobanServer.simulateTransaction(tx)
	if (SorobanRpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation failed: ${sim.error}`)
	}
	const retval = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse)
		.result?.retval
	return retval ? scValToNative(retval) : null
}

// =================== Public contract API ===================

export const invoiceContract = {
	async createInvoice(args: {
		id: string
		creator: string
		amountStroops: string | bigint
		asset: string
		memo: string
	}): Promise<{ hash: string; invoice: Invoice }> {
		const contract = new Contract(requireContractId())
		const op = contract.call(
			"create_invoice",
			nativeToScVal(args.id, { type: "string" }),
			new Address(args.creator).toScVal(),
			nativeToScVal(BigInt(args.amountStroops), { type: "i128" }),
			nativeToScVal(args.asset, { type: "string" }),
			nativeToScVal(args.memo, { type: "string" }),
		)
		const { hash, result } = await buildAndSign(op, args.creator)
		const invoice = normaliseInvoice(
			(result as Record<string, unknown>) || {},
			args.id,
		)
		return { hash, invoice }
	},

	async markPaid(args: {
		id: string
		payer: string
		paidAmountStroops: string | bigint
	}): Promise<{ hash: string; invoice: Invoice }> {
		const contract = new Contract(requireContractId())
		const op = contract.call(
			"mark_paid",
			nativeToScVal(args.id, { type: "string" }),
			new Address(args.payer).toScVal(),
			nativeToScVal(BigInt(args.paidAmountStroops), { type: "i128" }),
		)
		const { hash, result } = await buildAndSign(op, args.payer)
		const invoice = normaliseInvoice(
			(result as Record<string, unknown>) || {},
			args.id,
		)
		return { hash, invoice }
	},

	async cancelInvoice(args: {
		id: string
		creator: string
	}): Promise<{ hash: string; invoice: Invoice }> {
		const contract = new Contract(requireContractId())
		const op = contract.call(
			"cancel_invoice",
			nativeToScVal(args.id, { type: "string" }),
			new Address(args.creator).toScVal(),
		)
		const { hash, result } = await buildAndSign(op, args.creator)
		const invoice = normaliseInvoice(
			(result as Record<string, unknown>) || {},
			args.id,
		)
		return { hash, invoice }
	},

	async getInvoice(
		id: string,
		callerPublicKey: string,
	): Promise<Invoice | null> {
		const contract = new Contract(requireContractId())
		const op = contract.call(
			"get_invoice",
			nativeToScVal(id, { type: "string" }),
		)
		try {
			const result = await simulateRead(op, callerPublicKey)
			if (!result) return null
			return normaliseInvoice(result as Record<string, unknown>, id)
		} catch (err) {
			if (String((err as Error).message).match(/InvoiceNotFound/i)) return null
			throw err
		}
	},

	async getCreatorInvoices(
		creator: string,
		callerPublicKey: string,
	): Promise<string[]> {
		const contract = new Contract(requireContractId())
		const op = contract.call(
			"get_creator_invoices",
			new Address(creator).toScVal(),
		)
		const result = await simulateRead(op, callerPublicKey)
		return (result as string[]) || []
	},
}

// =================== XLM payment ===================

/**
 * Build, sign, and submit a classic XLM payment from `payer` to `destination`.
 * Returns the transaction hash.
 */
export async function payInvoiceXLM(args: {
	payer: string
	destination: string
	amountHuman: string
	memo?: string
}): Promise<string> {
	const account = await horizon.loadAccount(args.payer)
	const builder = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase,
	})
		.addOperation(
			Operation.payment({
				destination: args.destination,
				asset: Asset.native(),
				amount: args.amountHuman,
			}),
		)
		.setTimeout(60)

	if (args.memo && args.memo.length > 0) {
		const { Memo } = await import("@stellar/stellar-sdk")
		builder.addMemo(Memo.text(args.memo.slice(0, 28)))
	}

	const tx = builder.build()
	const { signedTxXdr } = await wallet.signTransaction(tx.toXDR(), {
		networkPassphrase,
		address: args.payer,
	})
	const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase)
	const result = await horizon.submitTransaction(signedTx)
	return result.hash
}

// =================== x402 client ===================

export const x402 = {
	async createInvoiceMeta(args: {
		amount: string
		asset: string
		memo: string
		creatorAddress: string
		id?: string
	}): Promise<{ id: string; payLink: string }> {
		const r = await fetch(`${X402_SERVER_URL}/api/invoice/create`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(args),
		})
		if (!r.ok) throw new Error(`x402 server error: ${r.status}`)
		return r.json() as Promise<{ id: string; payLink: string }>
	},

	async getInvoice(id: string): Promise<Invoice> {
		const r = await fetch(`${X402_SERVER_URL}/api/invoice/${id}`)
		if (r.status === 404) throw new Error("Invoice not found")
		if (!r.ok) throw new Error(`x402 server error: ${r.status}`)
		return r.json() as Promise<Invoice>
	},

	/** Initial 402 challenge (no X-Payment header). Returns the requirements. */
	async fetchPaymentChallenge(id: string): Promise<{
		version: string
		accepts: Array<{
			scheme: string
			network: string
			asset: string
			amount: string
			amountStroops: string
			payTo: string
			memo: string
			maxTimeoutSeconds: number
			contractId: string
			invoiceId: string
		}>
		invoice: Invoice
	}> {
		const r = await fetch(`${X402_SERVER_URL}/api/invoice/${id}/pay`, {
			method: "POST",
		})
		if (r.status !== 402) {
			// Could already be paid
			if (r.ok) {
				const data = await r.json()
				return { version: "x402/1.0", accepts: [], invoice: data.invoice }
			}
			throw new Error(`x402 server error: ${r.status}`)
		}
		return r.json()
	},

	/** Settle: tell the server which Stellar tx hash paid the invoice. */
	async settle(
		id: string,
		txHash: string,
	): Promise<{ ok: boolean; invoice: Invoice; txHash: string }> {
		const r = await fetch(`${X402_SERVER_URL}/api/invoice/${id}/pay`, {
			method: "POST",
			headers: { "X-Payment": txHash },
		})
		if (!r.ok) throw new Error(`x402 settle error: ${r.status}`)
		return r.json() as Promise<{
			ok: boolean
			invoice: Invoice
			txHash: string
		}>
	},

	async listByCreator(creator: string): Promise<Invoice[]> {
		const r = await fetch(
			`${X402_SERVER_URL}/api/invoices?creator=${encodeURIComponent(creator)}`,
		)
		if (!r.ok) throw new Error(`x402 server error: ${r.status}`)
		const data = (await r.json()) as { invoices: Invoice[] }
		return data.invoices
	},
}

// =================== ID generator ===================

export function newInvoiceId(): string {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let id = "inv_"
	const cryptoObj =
		typeof window !== "undefined" && window.crypto ? window.crypto : null
	const bytes = new Uint8Array(10)
	if (cryptoObj) cryptoObj.getRandomValues(bytes)
	else
		for (let i = 0; i < bytes.length; i++)
			bytes[i] = Math.floor(Math.random() * 256)
	for (const b of bytes) id += alphabet[b % alphabet.length]
	return id
}
