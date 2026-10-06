# Staging signing secret recovery

The signing escrow extends the existing Phase 2 runtime escrow with exact pinned delivery, gateway, lifecycle and original provider API configurations. It uses the existing encrypted archive bucket, KMS key and separate read-only recovery role. No additional hosting service is introduced.

`locator.json` records immutable S3 object versions and credential version identifiers, never credential values. `verification.json` records actual independent retrieval and offline decryption after temporary source copies were removed. Recovery verifies all four entries, the original provider credential binding, shared delivery/lifecycle encryption key, trust certificate fingerprint and a synthetic delivery record encrypted before capture. Six live denials cover source-secret reads, overwrite and wrong KMS context. Backup identities cannot read the escrow; temporary plaintext and the broker access key are removed.

This verifies secret recovery, not a restart of restored live applications. The original Phase 2 escrow remains the recovery source for existing application authentication, database, provider encryption and signing-certificate material.

Commands: `python3 -B portal/guest-documents/deployment/signing-recovery/escrow.py capture`, then `recover`. Recorded versions are immutable; repeated commands reuse matching receipts rather than rotating secrets.
