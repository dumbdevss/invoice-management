#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn s(env: &Env, value: &str) -> String {
    String::from_str(env, value)
}

fn setup<'a>() -> (Env, StellarInvoiceClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StellarInvoice, ());
    let client = StellarInvoiceClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    (env, client, creator)
}

#[test]
fn create_invoice_succeeds() {
    let (env, client, creator) = setup();
    let invoice = client.create_invoice(
        &s(&env, "inv_001"),
        &creator,
        &100_000_000_i128,
        &s(&env, "XLM"),
        &s(&env, "test memo"),
    );
    assert_eq!(invoice.id, s(&env, "inv_001"));
    assert_eq!(invoice.amount, 100_000_000);
    assert_eq!(invoice.status, InvoiceStatus::Pending);
    assert_eq!(invoice.creator, creator);
}

#[test]
fn duplicate_invoice_fails() {
    let (env, client, creator) = setup();
    let id = s(&env, "inv_dup");
    client.create_invoice(&id, &creator, &10_i128, &s(&env, "XLM"), &s(&env, ""));
    let res = client.try_create_invoice(&id, &creator, &10_i128, &s(&env, "XLM"), &s(&env, ""));
    assert!(res.is_err());
}

#[test]
fn invalid_amount_fails() {
    let (env, client, creator) = setup();
    let res = client.try_create_invoice(
        &s(&env, "inv_bad"),
        &creator,
        &0_i128,
        &s(&env, "XLM"),
        &s(&env, ""),
    );
    assert!(res.is_err());
}

#[test]
fn mark_paid_succeeds() {
    let (env, client, creator) = setup();
    let payer = Address::generate(&env);
    client.create_invoice(
        &s(&env, "inv_pay"),
        &creator,
        &100_i128,
        &s(&env, "XLM"),
        &s(&env, ""),
    );
    let inv = client.mark_paid(&s(&env, "inv_pay"), &payer, &100_i128);
    assert_eq!(inv.status, InvoiceStatus::Paid);
    assert_eq!(inv.payer, Some(payer));
}

#[test]
fn underpayment_fails() {
    let (env, client, creator) = setup();
    let payer = Address::generate(&env);
    client.create_invoice(
        &s(&env, "inv_under"),
        &creator,
        &100_i128,
        &s(&env, "XLM"),
        &s(&env, ""),
    );
    let res = client.try_mark_paid(&s(&env, "inv_under"), &payer, &50_i128);
    assert!(res.is_err());
}

#[test]
fn cancel_invoice_succeeds() {
    let (env, client, creator) = setup();
    client.create_invoice(
        &s(&env, "inv_cancel"),
        &creator,
        &100_i128,
        &s(&env, "XLM"),
        &s(&env, ""),
    );
    let inv = client.cancel_invoice(&s(&env, "inv_cancel"), &creator);
    assert_eq!(inv.status, InvoiceStatus::Cancelled);
}

#[test]
fn cancel_by_non_creator_fails() {
    let (env, client, creator) = setup();
    let intruder = Address::generate(&env);
    client.create_invoice(
        &s(&env, "inv_x"),
        &creator,
        &100_i128,
        &s(&env, "XLM"),
        &s(&env, ""),
    );
    let res = client.try_cancel_invoice(&s(&env, "inv_x"), &intruder);
    assert!(res.is_err());
}

#[test]
fn get_creator_invoices_returns_all() {
    let (env, client, creator) = setup();
    client.create_invoice(&s(&env, "a"), &creator, &1_i128, &s(&env, "XLM"), &s(&env, ""));
    client.create_invoice(&s(&env, "b"), &creator, &2_i128, &s(&env, "XLM"), &s(&env, ""));
    client.create_invoice(&s(&env, "c"), &creator, &3_i128, &s(&env, "XLM"), &s(&env, ""));
    let ids = client.get_creator_invoices(&creator);
    assert_eq!(ids.len(), 3);
}

#[test]
fn is_paid_works() {
    let (env, client, creator) = setup();
    let payer = Address::generate(&env);
    client.create_invoice(&s(&env, "p1"), &creator, &10_i128, &s(&env, "XLM"), &s(&env, ""));
    assert!(!client.is_paid(&s(&env, "p1")));
    client.mark_paid(&s(&env, "p1"), &payer, &10_i128);
    assert!(client.is_paid(&s(&env, "p1")));
}
