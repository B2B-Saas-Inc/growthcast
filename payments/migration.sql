-- Review-only migration. Run as database owner in the dedicated TEST project.
BEGIN;
CREATE SCHEMA payment_private;
REVOKE ALL ON SCHEMA payment_private FROM PUBLIC;
CREATE TABLE payment_private.bindings (
 account_id text NOT NULL CHECK (account_id = 'acct_1ScttyEQy6YYD2FL'),
 invoice_id text NOT NULL, customer_id text NOT NULL,
 engagement_id uuid NOT NULL,
 is_current boolean NOT NULL DEFAULT false,
 PRIMARY KEY(account_id, invoice_id)
);
CREATE UNIQUE INDEX one_current_invoice ON payment_private.bindings(account_id, engagement_id) WHERE is_current;
CREATE TABLE payment_private.events (
 account_id text NOT NULL CHECK (account_id = 'acct_1ScttyEQy6YYD2FL'),
 event_id text NOT NULL, event_type text NOT NULL, invoice_id text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete','quarantined')),
 received_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 PRIMARY KEY(account_id,event_id)
);
CREATE TABLE payment_private.invoices (
 account_id text NOT NULL, invoice_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','open','paid','void','uncollectible')),
 currency text NOT NULL CHECK(currency='usd'),
 amount_due bigint NOT NULL, amount_paid bigint NOT NULL, amount_remaining bigint NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,invoice_id),
 FOREIGN KEY(account_id,invoice_id) REFERENCES payment_private.bindings(account_id,invoice_id)
);
ALTER TABLE payment_private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_private.bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_private.invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA payment_private FROM PUBLIC;
CREATE ROLE growthcast_payment_receiver NOLOGIN;
GRANT USAGE ON SCHEMA payment_private TO growthcast_payment_receiver;
GRANT SELECT ON payment_private.bindings TO growthcast_payment_receiver;
GRANT SELECT,INSERT,UPDATE ON payment_private.events, payment_private.invoices TO growthcast_payment_receiver;
CREATE POLICY receiver_bindings ON payment_private.bindings FOR SELECT TO growthcast_payment_receiver USING (true);
CREATE POLICY receiver_events ON payment_private.events TO growthcast_payment_receiver USING (true) WITH CHECK (true);
CREATE POLICY receiver_invoices ON payment_private.invoices TO growthcast_payment_receiver USING (true) WITH CHECK (true);
-- Separately provision a server-only LOGIN role inheriting this NOLOGIN role.
-- Never grant it to anon/authenticated or expose this schema through the Data API.
COMMIT;
