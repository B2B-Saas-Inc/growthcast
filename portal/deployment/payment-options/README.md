# Stripe payment-method lookup and supplied favicon

## Cause and fix

The deployed upstream code called `stripe.accounts.retrieve("me", {expand:["capabilities"]})`. A read-only audit of the retained organization's saved live key reproduced Stripe's `account_invalid` HTTP 403. The method swallowed that error and returned every method as inactive, disabling the UI even though the key was valid.

The direct-key path now calls `stripe.accounts.retrieve()` (authenticated account). Stripe Connect uses the explicit connected-account ID. No capabilities expansion is requested. The production helper confirms `charges_enabled=true` and seven active supported capabilities for the retained account: card, Link, ACH, Klarna, Afterpay/Clearpay, Affirm, Cash App. SEPA, iDEAL and Bacs remain inactive for this account. Currency, amount, customer and Checkout restrictions may still apply to an individual payment. Existing explicit `payment_method_types` checkout behavior is unchanged; no Stripe configuration is mutated by this fix.

Lookup errors now return a bounded 503 message and a visible retry control instead of pretending all methods are disabled. The last selected method cannot be unchecked until another is selected; this is explained in the UI and no longer dims the entire enabled-method label. Methods remain disabled when Stripe has disabled charges.

Stripe reference: [Retrieve account](https://docs.stripe.com/api/accounts/retrieve). A separate read-only [payment-method configuration](https://docs.stripe.com/api/payment_method_configurations/list) audit is recorded for context; those dashboard configuration preferences are not substituted for the current manual Checkout integration's capability check.

## Known separate live-payment blocker

The key-save flow registered its webhook at the protected staging frontend `/api/payments/webhook/<organization>`. An unauthenticated empty POST returns **HTTP 401 from the staging access boundary**. Stripe cannot complete webhook delivery through that login gate. This feature fixes the settings lookup, not end-to-end live payment acceptance. A separately scoped, signature-verified public webhook entry point and checkout/webhook acceptance remain necessary. The live key, selected methods, registered Stripe webhook and existing security boundary were not modified. No checkout, PaymentIntent, charge, refund or Stripe configuration change was made.

## Favicon

`web-app/brand/growthcast-favicon-v2.jpg` is an exact byte copy of the user-supplied 500×500 JPEG. Frontend metadata uses the versioned path for both icon and shortcut icon, with `image/jpeg` and explicit dimensions. Existing portal wordmark assets remain unchanged. Browser verification hashes the deployed favicon bytes against the copied attachment.

## Evidence

- `before-audit-evidence.json`: live-key rejection using old lookup; correct authenticated account succeeds.
- `audit-evidence.json`: production-built patched helper, same key, read-only Stripe calls, eligible-method results.
- `deployment.json`: API task/service-only rollout; no schema or recovery changes required.
- `acceptance.json`: real deployed favicon bytes and frontend tests using explicitly intercepted read responses derived from the live audit. These are not claims of authenticated browser access to the retained owner's Stripe settings (the retained local admin password was changed/rejected earlier).
- `cleanup-evidence.json`: disposable fixture removal. No user projects or Stripe settings changed.
- API build: 39 tests pass, including direct-account routing, Connect routing, disabled charges and safe lookup failures. Frontend build passes.
