// x402 server for the StellarPay invoice system.
//
// Endpoints:
//   POST   /api/invoice/create           Create a new invoice
//   GET    /api/invoice/:id              Read an invoice
//   POST   /api/invoice/:id/pay          x402 payment flow (402 challenge or settle tx)
//   DELETE /api/invoice/:id              Cancel an invoice
//   GET    /api/invoices?creator=GXXX    List invoices by creator
//
// All on-chain reads/writes go to the Soroban `stellar-invoice` contract.

import "dotenv/config"
import {
	Address,
	Asset,
	BASE_FEE,
	Contract,
	Horizon,
	Keypair,
	Networks,
	Operation,
	rpc as SorobanRpc,
	TransactionBuilder,
	nativeToScVal,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk"
import cors from "cors"
import express from "express"
import { nanoid } from "nanoid"

// =================== Config ===================

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet"
const NETWORK_PASSPHRASE =
	STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET
const RPC_URL =
	STELLAR_NETWORK === "mainnet"
		? "https://soroban.stellar.org"
		: "https://soroban-testnet.stellar.org"
const HORIZON_URL =
	STELLAR_NETWORK === "mainnet"
		? "https://horizon.stellar.org"
		: "https://horizon-testnet.stellar.org"

const CONTRACT_ID = process.env.INVOICE_CONTRACT_ID
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"
const PORT = Number(process.env.PORT || 4000)
const USDC_ISSUER =
	process.env.USDC_ISSUER ||
	"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

if (!CONTRACT_ID) {
	console.warn(
		"[warn] INVOICE_CONTRACT_ID not set. /api/invoice/* will fail until the contract is deployed.",
	)
}

// Optional server-side signer (used to call mark_paid on behalf of a payer
// once the on-chain payment has been verified). For demos, you can set
// DEPLOYER_SECRET in env. Otherwise we expect the frontend to perform mark_paid
// directly with the user's wallet.
const SERVER_SECRET = process.env.DEPLOYER_SECRET
const serverKeypair = SERVER_SECRET ? Keypair.fromSecret(SERVER_SECRET) : null

const sorobanServer = new SorobanRpc.Server(RPC_URL, {
	allowHttp: STELLAR_NETWORK !== "mainnet" ? false : false,
})
const horizon = new Horizon.Server(HORIZON_URL)

// =================== App ===================

const app = express()
app.use(express.json({ limit: "1mb" }))
app.use(cors({ origin: FRONTEND_URL, credentials: true }))

// In-memory cache of off-chain metadata (memo, payLink) keyed by id.
// On-chain is source of truth; this is just a perf-friendly mirror.
const invoiceMeta = new Map()

// =================== Helpers ===================

const STROOPS_PER_UNIT = 10_000_000n

function toStroops(amountStr) {
	// Accepts "10", "10.5", "0.0001" etc, returns BigInt stroops.
	const [whole, frac = ""] = String(amountStr).split(".")
	const fracPadded = (frac + "0000000").slice(0, 7)
	const stroops = BigInt(whole) * STROOPS_PER_UNIT + BigInt(fracPadded || "0")
	return stroops
}

function fromStroops(stroops) {
	const n = BigInt(stroops)
	const whole = n / STROOPS_PER_UNIT
	const frac = n % STROOPS_PER_UNIT
	return `${whole}.${frac.toString().padStart(7, "0").replace(/0+$/, "")}`.replace(
		/\.$/,
		"",
	)
}

function buildContract() {
	if (!CONTRACT_ID) throw new Error("INVOICE_CONTRACT_ID not set")
	return new Contract(CONTRACT_ID)
}

async function simulateRead(operationFn) {
	// Build a tx that calls a read-only contract function and simulate it.
	// We use the deployer account if configured, otherwise a generated dummy
	// keypair. For pure reads simulation does not require a real signer.
	const sourceKeypair = serverKeypair || Keypair.random()
	let account
	try {
		account = await horizon.loadAccount(sourceKeypair.publicKey())
	} catch {
		account = new (await import("@stellar/stellar-sdk")).Account(
			sourceKeypair.publicKey(),
			"0",
		)
	}

	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: NETWORK_PASSPHRASE,
	})
		.addOperation(operationFn())
		.setTimeout(30)
		.build()

	const sim = await sorobanServer.simulateTransaction(tx)
	if (SorobanRpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation failed: ${sim.error}`)
	}
	return sim.result?.retval
}

function invoiceFromScVal(retval) {
	if (!retval) return null
	return scValToNative(retval)
}

async function readInvoice(id) {
	const contract = buildContract()
	const retval = await simulateRead(() =>
		contract.call("get_invoice", nativeToScVal(id, { type: "string" })),
	)
	const inv = invoiceFromScVal(retval)
	return inv
}

async function readCreatorInvoiceIds(creator) {
	const contract = buildContract()
	const retval = await simulateRead(() =>
		contract.call("get_creator_invoices", new Address(creator).toScVal()),
	)
	return invoiceFromScVal(retval) || []
}

function normaliseInvoice(raw, id) {
	if (!raw) return null
	const meta = invoiceMeta.get(id) || {}
	// status enum comes back as { tag: "Pending"|"Paid"|"Cancelled" }
	const status = typeof raw.status === "string" ? raw.status : raw.status?.tag
	return {
		id: raw.id ?? id,
		creator: raw.creator,
		payer: raw.payer ?? null,
		amount: String(raw.amount), // stroops as string
		amountHuman: fromStroops(raw.amount),
		asset: raw.asset,
		memo: raw.memo,
		status: (status || "").toLowerCase(),
		createdAt: Number(raw.created_at ?? raw.createdAt ?? 0),
		paidAt: raw.paid_at ? Number(raw.paid_at) : null,
		payLink: meta.payLink || `${FRONTEND_URL}/pay/${id}`,
		txHash: meta.txHash || null,
	}
}

// =================== Routes ===================

app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		network: STELLAR_NETWORK,
		contractId: CONTRACT_ID || null,
		rpc: RPC_URL,
	})
})

/**
 * POST /api/invoice/create
 * Body: { id?, amount, asset, memo, creatorAddress }
 *
 * NOTE: This endpoint does NOT submit the on-chain create_invoice tx —
 * the frontend signs and submits it with the user's wallet. We just
 * generate a unique ID and store off-chain metadata (payLink) for
 * convenience.
 */
app.post("/api/invoice/create", async (req, res) => {
	try {
		const {
			id: providedId,
			amount,
			asset,
			memo,
			creatorAddress,
		} = req.body || {}
		if (!amount || !asset || !creatorAddress) {
			return res
				.status(400)
				.json({ error: "amount, asset and creatorAddress are required" })
		}
		const id = providedId || nanoid(12)
		const payLink = `${FRONTEND_URL}/pay/${id}`
		invoiceMeta.set(id, { payLink })
		return res.status(201).json({
			id,
			payLink,
			amount,
			asset,
			memo: memo || "",
			creator: creatorAddress,
			status: "pending",
		})
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: err.message })
	}
})

/**
 * GET /api/invoice/:id
 * Reads the invoice from the Soroban contract.
 */
app.get("/api/invoice/:id", async (req, res) => {
	try {
		const raw = await readInvoice(req.params.id)
		if (!raw) return res.status(404).json({ error: "Invoice not found" })
		return res.json(normaliseInvoice(raw, req.params.id))
	} catch (err) {
		if (String(err.message || err).match(/InvoiceNotFound|HostError/i)) {
			return res.status(404).json({ error: "Invoice not found" })
		}
		console.error(err)
		res.status(500).json({ error: err.message })
	}
})

/**
 * POST /api/invoice/:id/pay  (x402)
 *
 * Without `X-Payment` header  ->  402 Payment Required + payment requirements.
 * With    `X-Payment: <hash>` ->  Verifies the on-chain tx and returns 200.
 */
app.post("/api/invoice/:id/pay", async (req, res) => {
	try {
		const id = req.params.id
		const raw = await readInvoice(id)
		if (!raw) return res.status(404).json({ error: "Invoice not found" })
		const inv = normaliseInvoice(raw, id)

		if (inv.status === "paid") {
			return res.json({ ok: true, invoice: inv })
		}
		if (inv.status === "cancelled") {
			return res.status(410).json({ error: "Invoice cancelled" })
		}

		const xPayment = req.headers["x-payment"]
		if (!xPayment) {
			// 402 Payment Required (x402 challenge)
			const accepts = [
				{
					scheme: "stellar",
					network: STELLAR_NETWORK,
					asset: inv.asset,
					amount: inv.amountHuman,
					amountStroops: inv.amount,
					payTo: inv.creator,
					memo: inv.memo,
					maxTimeoutSeconds: 300,
					contractId: CONTRACT_ID,
					invoiceId: id,
				},
			]
			res.status(402).json({
				version: "x402/1.0",
				accepts,
				invoice: inv,
			})
			return
		}

		// Settle: client provides the Stellar tx hash that paid the invoice.
		const txHash = String(xPayment)
		let tx
		try {
			tx = await horizon.transactions().transaction(txHash).call()
		} catch {
			return res
				.status(400)
				.json({ error: `Transaction ${txHash} not found on Horizon yet` })
		}
		if (!tx.successful) {
			return res.status(400).json({ error: "Transaction not successful" })
		}

		invoiceMeta.set(id, {
			...(invoiceMeta.get(id) || {}),
			txHash,
		})

		// Re-read invoice from chain (frontend will have already called mark_paid).
		const refreshed = await readInvoice(id)
		return res.json({
			ok: true,
			txHash,
			invoice: normaliseInvoice(refreshed, id),
		})
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: err.message })
	}
})

/**
 * DELETE /api/invoice/:id
 * Off-chain note only — the actual cancellation must be signed by the
 * creator's wallet on the frontend (calls cancel_invoice on the contract).
 */
app.delete("/api/invoice/:id", async (req, res) => {
	try {
		const raw = await readInvoice(req.params.id)
		if (!raw) return res.status(404).json({ error: "Invoice not found" })
		return res.json({
			ok: true,
			message:
				"Cancellation must be signed by the creator wallet on the frontend.",
			invoice: normaliseInvoice(raw, req.params.id),
		})
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: err.message })
	}
})

/**
 * GET /api/invoices?creator=GXXX
 */
app.get("/api/invoices", async (req, res) => {
	try {
		const creator = String(req.query.creator || "")
		if (!creator) return res.status(400).json({ error: "creator required" })
		const ids = await readCreatorInvoiceIds(creator)
		const invoices = []
		for (const id of ids) {
			try {
				const raw = await readInvoice(String(id))
				if (raw) invoices.push(normaliseInvoice(raw, String(id)))
			} catch {
				// skip individual failures
			}
		}
		return res.json({ creator, invoices })
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: err.message })
	}
})

// =================== Boot ===================

app.listen(PORT, () => {
	console.log(`x402 server listening on http://localhost:${PORT}`)
	console.log(`  Network: ${STELLAR_NETWORK}`)
	console.log(`  Contract: ${CONTRACT_ID || "(unset)"}`)
})

// silence unused import warnings (kept for future server-side signing)
void Asset
void Operation
void xdr
void USDC_ISSUER
