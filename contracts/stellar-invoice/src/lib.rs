#![no_std]
#![allow(deprecated)]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
    Vec,
};

mod test;

// =================== Errors ===================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvoiceNotFound = 1,
    InvoiceAlreadyExists = 2,
    InvoiceNotPending = 3,
    UnderPayment = 4,
    InvalidAmount = 5,
    NotInvoiceCreator = 6,
}

// =================== Types ===================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InvoiceStatus {
    Pending,
    Paid,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Invoice {
    pub id: String,
    pub creator: Address,
    pub payer: Option<Address>,
    /// in stroops (1 XLM = 10_000_000)
    pub amount: i128,
    /// "XLM" | "USDC" | a Stellar contract address (as String)
    pub asset: String,
    pub memo: String,
    pub status: InvoiceStatus,
    pub created_at: u64,
    pub paid_at: Option<u64>,
}

// =================== Storage Keys ===================

#[contracttype]
pub enum DataKey {
    /// invoice id -> Invoice
    Invoice(String),
    /// creator address -> Vec<invoice id>
    CreatorIndex(Address),
}

const INVOICE_TTL: Symbol = symbol_short!("INVOICE");

// Persistent storage TTLs (in ledgers)
// On testnet, ~5s per ledger -> 17280 ledgers ~= 24 hours.
const ENTRY_BUMP: u32 = 6 * 30 * 17280; // ~6 months
const ENTRY_LIFETIME: u32 = 7 * 30 * 17280; // ~7 months

// =================== Contract ===================

#[contract]
pub struct StellarInvoice;

#[contractimpl]
impl StellarInvoice {
    /// Create a new pending invoice.
    /// Requires auth from the creator.
    pub fn create_invoice(
        env: Env,
        id: String,
        creator: Address,
        amount: i128,
        asset: String,
        memo: String,
    ) -> Result<Invoice, Error> {
        creator.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Invoice(id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::InvoiceAlreadyExists);
        }

        let invoice = Invoice {
            id: id.clone(),
            creator: creator.clone(),
            payer: None,
            amount,
            asset,
            memo,
            status: InvoiceStatus::Pending,
            created_at: env.ledger().timestamp(),
            paid_at: None,
        };

        env.storage().persistent().set(&key, &invoice);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_BUMP, ENTRY_LIFETIME);

        // Update creator index
        let index_key = DataKey::CreatorIndex(creator.clone());
        let mut ids: Vec<String> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or(Vec::new(&env));
        ids.push_back(id.clone());
        env.storage().persistent().set(&index_key, &ids);
        env.storage()
            .persistent()
            .extend_ttl(&index_key, ENTRY_BUMP, ENTRY_LIFETIME);

        env.events()
            .publish((INVOICE_TTL, symbol_short!("created")), invoice.clone());

        Ok(invoice)
    }

    /// Mark an invoice as paid. Requires auth from the payer.
    /// `paid_amount` must be >= invoice.amount.
    pub fn mark_paid(
        env: Env,
        id: String,
        payer: Address,
        paid_amount: i128,
    ) -> Result<Invoice, Error> {
        payer.require_auth();

        let key = DataKey::Invoice(id.clone());
        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::InvoiceNotFound)?;

        if invoice.status != InvoiceStatus::Pending {
            return Err(Error::InvoiceNotPending);
        }

        if paid_amount < invoice.amount {
            return Err(Error::UnderPayment);
        }

        invoice.status = InvoiceStatus::Paid;
        invoice.payer = Some(payer.clone());
        invoice.paid_at = Some(env.ledger().timestamp());

        env.storage().persistent().set(&key, &invoice);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_BUMP, ENTRY_LIFETIME);

        env.events()
            .publish((INVOICE_TTL, symbol_short!("paid")), invoice.clone());

        Ok(invoice)
    }

    /// Cancel a pending invoice. Only the creator can cancel.
    pub fn cancel_invoice(env: Env, id: String, creator: Address) -> Result<Invoice, Error> {
        creator.require_auth();

        let key = DataKey::Invoice(id.clone());
        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::InvoiceNotFound)?;

        if invoice.creator != creator {
            return Err(Error::NotInvoiceCreator);
        }

        if invoice.status != InvoiceStatus::Pending {
            return Err(Error::InvoiceNotPending);
        }

        invoice.status = InvoiceStatus::Cancelled;
        env.storage().persistent().set(&key, &invoice);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_BUMP, ENTRY_LIFETIME);

        env.events()
            .publish((INVOICE_TTL, symbol_short!("cancel")), invoice.clone());

        Ok(invoice)
    }

    /// Read an invoice by ID.
    pub fn get_invoice(env: Env, id: String) -> Result<Invoice, Error> {
        let key = DataKey::Invoice(id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::InvoiceNotFound)
    }

    /// Returns the IDs of all invoices created by `creator`.
    pub fn get_creator_invoices(env: Env, creator: Address) -> Vec<String> {
        let key = DataKey::CreatorIndex(creator);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env))
    }

    /// Convenience: returns true if invoice has been paid.
    pub fn is_paid(env: Env, id: String) -> Result<bool, Error> {
        let invoice = Self::get_invoice(env, id)?;
        Ok(invoice.status == InvoiceStatus::Paid)
    }
}
