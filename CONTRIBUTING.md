# Contributing to StellarPay

Thank you for your interest in contributing. StellarPay is an open project and contributions of all kinds are welcome — from bug fixes and documentation improvements to major new features. This guide covers everything you need to get up and running as a contributor.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project conventions](#project-conventions)
- [Submitting a pull request](#submitting-a-pull-request)
- [Good first issues](#good-first-issues)
- [Bigger features — open for contribution](#bigger-features--open-for-contribution)
- [Contract upgrade policy](#contract-upgrade-policy)
- [Getting help](#getting-help)

---

## Code of conduct

Be respectful and constructive. We are building something useful for real people — freelancers and small businesses in Nigeria and across Africa — and that context should inform every decision. Discrimination, harassment, or bad-faith behaviour will result in removal from the project.

---

## Ways to contribute

You do not need to write code to contribute meaningfully.

- **Report a bug** — open an issue describing what you expected vs what happened, your OS, browser, and wallet version.
- **Suggest a feature** — open an issue tagged `enhancement`. Describe the use case before the solution.
- **Improve documentation** — fix typos, clarify confusing sections, add examples.
- **Write tests** — the Soroban contract test coverage can always grow.
- **Build an extension** — see the [Bigger features](#bigger-features--open-for-contribution) section.
- **Review pull requests** — leave thoughtful, specific feedback on open PRs.

---

## Development setup

Full setup instructions are in [README.md](README.md). The short version:

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/stellar-invoice.git
cd stellar-invoice

# 2. Contract
cd contract
rustup target add wasm32-unknown-unknown
cargo test --features testutils

# 3. x402 server
cd ../x402-server
cp .env.example .env
npm install
npm run dev

# 4. Frontend
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

You need a Freighter wallet set to **Testnet** and a funded testnet account (https://laboratory.stellar.org/#account-creator).

---

## Project conventions

### Git workflow

- Fork the repo, work on a branch named `feat/your-feature` or `fix/what-you-fixed`.
- Keep commits small and focused. One logical change per commit.
- Write commit messages in the imperative: `Add USDC validation to mark_paid`, not `Added USDC` or `USDC stuff`.
- Open a PR against `main`. Link any related issue in the PR description.

### Soroban contract (Rust)

- Follow standard Rust formatting: `cargo fmt` before committing.
- Run `cargo clippy --features testutils -- -D warnings` and fix all warnings.
- Every new public function must have at least one test in `#[cfg(test)]`.
- Amount parameters are always in **stroops** (`i128`). Add a comment if this might be ambiguous.
- Contract storage keys live in the `DataKey` enum — add new variants there, do not use raw strings.
- When adding a new function, update the function table in `README.md`.

### x402 server (Node.js)

- ES modules (`type: "module"` in `package.json`) — use `import`, not `require`.
- All route handlers are async. Wrap logic in try/catch and return descriptive error JSON.
- Keep the x402 response body compliant with the spec (see `buildPaymentRequired()` in `server.js`).
- Do not add state that is not mirrored to the Soroban contract — the contract is the source of truth.

### Frontend (Next.js / React)

- App Router only — no Pages Router.
- Use Tailwind utility classes. Do not add a separate CSS file per component.
- All Stellar/wallet logic belongs in `src/lib/stellar.js`, not inside components.
- Components should not call `fetch()` directly — use the helper functions in `stellar.js` or a dedicated `api.js` file.
- No `console.log` left in committed code.

### Naming

- Invoice IDs are short alphanumeric strings generated client-side with `nanoid`. Do not use sequential integers.
- Amounts displayed to users are always in human-readable units (e.g. `10 XLM`). Amounts stored and passed to the contract are always in stroops.

---

## Submitting a pull request

1. Ensure `cargo test --features testutils` passes with no failures.
2. Ensure `cargo fmt` and `cargo clippy` produce no warnings.
3. Ensure `npm run build` in `frontend/` completes without errors.
4. Fill in the PR template:
   - **What does this change?**
   - **Why is this needed?**
   - **How was it tested?** (manual steps or automated tests)
   - **Screenshots** (for frontend changes)
5. Keep the PR focused — one feature or fix per PR. Large PRs are hard to review and slower to merge.

PRs that touch the Soroban contract will be reviewed more carefully because deployed contracts cannot easily be changed. See [Contract upgrade policy](#contract-upgrade-policy).

---

## Good first issues

These are scoped, self-contained, and well-documented. They are good starting points if you are new to the codebase.

### Frontend

**QR code on the pay page**
The `/pay/:id` page should display a QR code that encodes the page URL itself, so a creator can show it on screen or print it. Use the `qrcode` npm package to render the code client-side. Place it below the invoice card and make it hideable.

Files to touch: `frontend/src/app/pay/[id]/page.jsx`

---

**Copy link button on the dashboard**
The dashboard lists invoices but does not give an easy way to re-copy the pay link. Add a copy icon button to each invoice row that copies `/pay/:id` to clipboard and shows a brief "Copied!" toast.

Files to touch: `frontend/src/app/dashboard/page.jsx`

---

**Amount validation feedback**
Currently if a user types a negative or zero amount, the error only appears after submission. Add inline validation that shows a red message as soon as the field loses focus.

Files to touch: `frontend/src/app/page.jsx`

---

### x402 server

**Request logging middleware**
Add a simple request logger using `morgan` that prints `METHOD /path STATUS duration` for every request in development. It should be disabled when `NODE_ENV=production`.

Files to touch: `x402-server/server.js`, `x402-server/package.json`

---

**Invoice expiry field**
Add an optional `expiresAt` (ISO timestamp) field to the create endpoint. If the invoice is still pending and the current time is past `expiresAt`, the pay endpoint should return a `410 Gone` response instead of the 402 payment prompt.

Files to touch: `x402-server/server.js`

---

### Soroban contract

**`get_invoice_status` helper**
Add a new contract function `get_invoice_status(id: String) -> InvoiceStatus` that returns only the status enum, without loading the full `Invoice` struct. This is cheaper for callers that only need to poll status.

Files to touch: `contract/src/lib.rs` (add function + test)

---

## Bigger features — open for contribution

These are more involved and may require discussion before implementation. Open an issue first to align on approach.

### USDC payment support

The frontend asset selector already shows USDC, but the x402 server and contract validation only handle XLM today. To add USDC:

- Update `resolveAsset()` in `stellar.js` to return the correct `Asset` object.
- Update `verifyPayment()` in `server.js` to check `paymentOp.asset.code === "USDC"` and validate the issuer address.
- Update `mark_paid()` in the contract to accept an `asset` parameter and validate it against the stored invoice asset.
- Add a testnet USDC trust line setup guide to the README.

---

### Persistent database

The x402 server currently stores invoices in a `Map` — data is lost on restart. Replace this with a real database:

- Add a `db.js` module with a simple interface: `createInvoice()`, `getInvoice()`, `updateInvoice()`, `listByCreator()`.
- Implement the interface using Postgres (via `pg` or `@neondatabase/serverless` for serverless deployments).
- Keep the Map-based implementation behind a `DB_URL` env var check so local development still works without a database.
- Add a `schema.sql` file with the table definition.

---

### Escrow mode

In standard mode, the payer sends funds directly to the creator's address. In escrow mode, funds go to the contract and are released only when the creator calls `release_payment()` (or both parties call `confirm()`).

This requires significant contract changes:

- Add `EscrowMode` variant to a new `InvoiceMode` enum.
- The contract must hold funds — implement `deposit()` and `release_payment()` functions.
- Add a new `dispute()` function that freezes funds pending manual resolution.
- Update the frontend to let creators choose escrow vs direct at invoice creation time.

---

### Webhook notifications

When an invoice is paid, notify a creator-registered webhook URL via a POST request. This makes StellarPay composable with any backend system.

- Add `webhookUrl` to the invoice creation request (optional).
- After `mark_paid()` succeeds, fire a POST to `webhookUrl` with `{ invoiceId, txHash, paidAt, amount, asset }`.
- Sign the webhook payload with an HMAC secret (creator provides the secret at creation time, stored server-side).
- Add retry logic — attempt delivery up to 3 times with exponential backoff.

---

### Soroban RPC integration

Currently the x402 server has its own in-memory invoice store, and the Soroban contract is a secondary store. The contract should be the single source of truth. To do this:

- Remove the in-memory Map from `server.js`.
- Use `@stellar/stellar-sdk`'s `SorobanRpc.Server` to call `get_invoice()` on every read.
- Use a funded server keypair to invoke `create_invoice()` and `mark_paid()` on writes.
- Handle Soroban RPC errors gracefully and surface them to the client.

---

## Contract upgrade policy

Soroban contracts are immutable once deployed. Changes to the contract interface break existing deployed instances. For this reason:

- Any PR that modifies `contract/src/lib.rs` must include a clear description of what changes and why.
- Additions (new functions, new optional fields) are preferred over modifications.
- Breaking changes to existing function signatures require a new contract version and a migration plan.
- PRs that modify the contract will be held for additional review time.

If you are unsure whether your change is breaking, open an issue first and describe what you want to do.

---

## Getting help

- Open a GitHub Discussion for questions about architecture or direction.
- Open an issue for bugs or concrete feature requests.
- Tag issues with `good first issue` if you believe they are suitable for newcomers.

The Stellar developer community also has active support channels:

- Stellar Discord: https://discord.gg/stellardev
- Soroban docs: https://soroban.stellar.org/docs
- Stellar Stack Exchange: https://stellar.stackexchange.com
