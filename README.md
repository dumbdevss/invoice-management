# StellarPay — Decentralized Invoice & Payment System

> A Web2 → Web3 bridge for invoicing. Create payment request links like Stripe or Paystack, but settled on the Stellar blockchain via the x402 protocol.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Network: Stellar Testnet](https://img.shields.io/badge/Network-Stellar%20Testnet-blueviolet)](https://stellar.org)
[![Contract: Soroban](https://img.shields.io/badge/Contract-Soroban-orange)](https://soroban.stellar.org)

---

## What is this?

StellarPay lets a freelancer, vendor, or small business generate a shareable invoice link in seconds. The recipient clicks the link, connects their Freighter wallet, and pays in XLM or USDC. The payment settles on Stellar — transparent, instant, and without a bank or payment processor in the middle.

**Why Stellar?** Near-zero fees (~0.00001 XLM per transaction), 3–5 second finality, native USDC support, and a growing ecosystem relevant to Africa and emerging markets where traditional payment processors have limited reach or high fees.

**Why x402?** The [x402 protocol](https://github.com/coinbase/x402) is an open HTTP standard for machine-readable payment requests. Any HTTP client — a browser, a CLI tool, another API — can discover payment requirements and pay programmatically, without custom integrations per wallet or service.

---

## Demo flow

```
1. Creator visits /             →  fills in amount, asset, description
2. Connects Freighter wallet    →  authenticates as invoice owner
3. Clicks "Create invoice"      →  invoice written to Soroban contract
4. Copies shareable link        →  /pay/V1StGXR8_Z5j

5. Payer opens /pay/:id         →  sees invoice details + amount due
6. Connects Freighter wallet    →  confirms payer identity
7. Clicks "Pay"                 →  Freighter signs a Stellar payment tx
8. x402 server verifies tx      →  submits to Stellar, calls mark_paid()
9. Invoice shows Paid           →  with on-chain transaction link
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Next.js Frontend                     │
│   /             Create invoice                           │
│   /pay/:id      Pay invoice  (the shareable link)        │
│   /dashboard    Creator invoice list                     │
└───────────────────────────┬──────────────────────────────┘
                            │ REST
┌───────────────────────────▼──────────────────────────────┐
│                  x402 Server  (Express / Node.js)        │
│                                                          │
│   POST /api/invoice/create     create + store invoice    │
│   GET  /api/invoice/:id        read invoice details      │
│   POST /api/invoice/:id/pay    x402 payment handler      │
│     ├── no X-Payment header →  402 + payment details     │
│     └── X-Payment: <xdr>    →  verify tx, mark paid      │
│   DELETE /api/invoice/:id      cancel invoice            │
│   GET  /api/invoices           list by creator           │
└───────────────────────────┬──────────────────────────────┘
                            │ Soroban RPC
┌───────────────────────────▼──────────────────────────────┐
│               Soroban Smart Contract  (Rust / WASM)      │
│                                                          │
│   create_invoice()    mark_paid()    cancel_invoice()    │
│   get_invoice()       is_paid()      get_creator_invoices()│
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│                     Stellar Network                      │
│               XLM  ·  USDC  ·  on-chain settlement       │
└──────────────────────────────────────────────────────────┘
```

---

## Project structure

```
stellar-invoice/
├── contract/                       Soroban smart contract
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs                  Invoice CRUD + payment validation logic
│
├── x402-server/                    HTTP payment middleware
│   ├── server.js                   Express app — x402 protocol implementation
│   ├── package.json
│   └── .env.example
│
└── frontend/                       Next.js 14 app (App Router)
    ├── next.config.mjs
    ├── tailwind.config.js
    ├── package.json
    └── src/
        ├── app/
        │   ├── layout.jsx
        │   ├── page.jsx                Create invoice page
        │   ├── pay/[id]/page.jsx       Pay page — the shareable link
        │   └── dashboard/page.jsx      Creator dashboard
        └── lib/
            └── stellar.js              Wallet, tx builder, x402 client
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust + cargo | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Stellar CLI | latest | `cargo install --locked stellar-cli` |
| Node.js | 20+ | https://nodejs.org |
| Freighter wallet | latest | https://freighter.app  (Chrome/Firefox extension) |

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/stellar-invoice.git
cd stellar-invoice
```

### 2. Build and deploy the Soroban contract

```bash
cd contract

# Add the WASM compilation target
rustup target add wasm32-unknown-unknown

# Run the test suite first
cargo test --features testutils

# Build the optimised WASM binary
stellar contract build

# Create and fund a testnet deployer account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# Deploy to testnet — copy the printed contract ID
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_invoice_contract.wasm \
  --source deployer \
  --network testnet
```

Save the printed contract ID — you will need it in the next step.

### 3. Configure and start the x402 server

```bash
cd ../x402-server
cp .env.example .env
# Open .env and paste your CONTRACT_ID
npm install
npm run dev
# Server running on http://localhost:4000
```

### 4. Configure and start the frontend

```bash
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
# App running on http://localhost:3000
```

### 5. Fund your testnet Freighter wallet

1. Install Freighter, create a wallet, and switch it to **Testnet**.
2. Visit https://laboratory.stellar.org/#account-creator and enter your public key to receive free testnet XLM.
3. Open http://localhost:3000, connect your wallet, and create your first invoice.

---

## Environment variables

### x402-server — `.env`

| Variable | Description | Default |
|---|---|---|
| `STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `CONTRACT_ID` | Deployed Soroban contract ID | — |
| `FRONTEND_URL` | Frontend origin (CORS + pay link generation) | `http://localhost:3000` |
| `USDC_ISSUER` | USDC issuer address for the chosen network | testnet address |
| `PORT` | Server port | `4000` |

### frontend — `.env.local`

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | x402 server base URL | `http://localhost:4000` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |

---

## Soroban contract reference

### Data types

```rust
enum InvoiceStatus { Pending, Paid, Cancelled }

struct Invoice {
    id: String,
    creator: Address,
    payer: Option<Address>,
    amount: i128,          // in stroops — 1 XLM = 10_000_000 stroops
    asset: String,         // "XLM" | "USDC" | Stellar contract address
    memo: String,
    status: InvoiceStatus,
    created_at: u64,       // ledger timestamp
    paid_at: Option<u64>,
}
```

### Functions

| Function | Auth required | Description |
|---|---|---|
| `create_invoice(id, creator, amount, asset, memo)` | `creator` | Creates a new pending invoice |
| `mark_paid(id, payer, paid_amount)` | `payer` | Validates amount and marks the invoice paid |
| `cancel_invoice(id, creator)` | `creator` | Cancels a pending invoice |
| `get_invoice(id)` | none | Returns the full invoice struct |
| `get_creator_invoices(creator)` | none | Returns all invoice IDs for a creator address |
| `is_paid(id)` | none | Returns a boolean |

### Stellar CLI usage

```bash
# Create an invoice (10 XLM = 100_000_000 stroops)
stellar contract invoke \
  --id <CONTRACT_ID> --source deployer --network testnet \
  -- create_invoice \
  --id '"inv_001"' \
  --creator GXXX \
  --amount 100000000 \
  --asset '"XLM"' \
  --memo '"Website redesign — April 2025"'

# Read an invoice
stellar contract invoke \
  --id <CONTRACT_ID> --network testnet \
  -- get_invoice --id '"inv_001"'

# Check if paid
stellar contract invoke \
  --id <CONTRACT_ID> --network testnet \
  -- is_paid --id '"inv_001"'

# Cancel an invoice
stellar contract invoke \
  --id <CONTRACT_ID> --source creator_key --network testnet \
  -- cancel_invoice --id '"inv_001"' --creator GXXX
```

---

## x402 protocol flow

x402 is an open HTTP standard for programmatic payment-gating. The full request–response cycle:

```
Client                         x402 Server                   Stellar
  │                                 │                            │
  │  POST /api/invoice/:id/pay      │                            │
  │  (no X-Payment header)          │                            │
  │ ──────────────────────────────► │                            │
  │                                 │                            │
  │ ◄──────────────────────────────  │                            │
  │  402 Payment Required            │                            │
  │  { version: "x402/1.0",         │                            │
  │    accepts: [{                   │                            │
  │      payTo, amount, asset,       │                            │
  │      maxTimeoutSeconds: 300      │                            │
  │    }] }                          │                            │
  │                                 │                            │
  │  [user signs tx in Freighter]   │                            │
  │                                 │                            │
  │  POST /api/invoice/:id/pay      │                            │
  │  X-Payment: <signed XDR>        │                            │
  │ ──────────────────────────────► │                            │
  │                                 │  submitTransaction(tx)     │
  │                                 │ ─────────────────────────► │
  │                                 │ ◄─────────────────────────  │
  │                                 │  { hash }                  │
  │ ◄──────────────────────────────  │                            │
  │  200 OK                          │                            │
  │  { invoice, txHash }             │                            │
```

---

## REST API reference

All endpoints are served from the x402 server (default port `4000`).

### `POST /api/invoice/create`

**Body:**
```json
{
  "amount": "10",
  "asset": "XLM",
  "memo": "Freelance work — April 2025",
  "creatorAddress": "GXXXXXXXXXXXXXXXXX"
}
```

**Response `201`:**
```json
{
  "id": "V1StGXR8_Z5j",
  "payLink": "http://localhost:3000/pay/V1StGXR8_Z5j",
  "invoice": { "id": "...", "status": "pending", ... }
}
```

### `GET /api/invoice/:id`

Returns the full invoice object. No authentication required — designed to be public so that the pay page works for anyone with the link.

### `POST /api/invoice/:id/pay`

Without `X-Payment` header → `402 Payment Required` with payment details.

With `X-Payment: <signed XDR>` header → verifies the Stellar transaction on-chain, calls `mark_paid()` on the contract, and returns `200 OK`.

### `DELETE /api/invoice/:id`

Sets `status` to `cancelled`. Only effective on pending invoices.

### `GET /api/invoices?creator=GXXX`

Returns an array of all invoices created by the given Stellar address.

---

## Supported assets

| Asset | Testnet | Mainnet |
|---|---|---|
| XLM | Native | Native |
| USDC | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| NGN stablecoin | Planned | Planned |

---

## Running tests

```bash
cd contract
cargo test --features testutils -- --nocapture
```

The suite covers invoice creation, underpayment rejection, and cancellation. See `src/lib.rs` under `#[cfg(test)]` for the full test module.

---

## Testnet resources

- Fund a testnet account: https://laboratory.stellar.org/#account-creator
- Freighter wallet: https://freighter.app
- Stellar Expert (testnet explorer): https://stellar.expert/explorer/testnet
- Soroban documentation: https://soroban.stellar.org
- x402 specification: https://github.com/coinbase/x402
- Stellar JS SDK: https://stellar.github.io/js-stellar-sdk

---

## Roadmap

- [ ] USDC payment path (contract validation + frontend asset switcher)
- [ ] Escrow mode — funds held in contract until both parties confirm delivery
- [ ] Subscription billing — recurring invoices via Soroban time-based triggers
- [ ] Webhooks — HTTP callbacks to backend apps on payment confirmation
- [ ] NGN stablecoin support
- [ ] Email and WhatsApp share via Resend and Twilio
- [ ] QR code on the pay page
- [ ] Persistent database (replace in-memory Map with Postgres)
- [ ] Direct Soroban RPC reads on the frontend (remove server-side duplication)
- [ ] Mobile wallet support (LOBSTR, Solar)

---

## License

MIT — see [LICENSE](LICENSE).
