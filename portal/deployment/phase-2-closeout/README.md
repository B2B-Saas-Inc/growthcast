# Phase 2 closeout

**Production update — 2026-09-25:** Phase 2 is now deployed at https://clients.growthcast.app with the staging setup migrated into a separate production environment. Staging remains independent. Existing account passwords are unchanged. See the [production release and operations record](../production/README.md). Earlier staging-only and deferred-production statements below are historical; Phase 3 document work remains next.

This package records completion against the original Repository and deployment foundation phase, separately from Phase 3 guest workflow, Phase 4 provider/account integration, Phase 6 invoice integration, and Phase 7 production pilot.

The selected Vercel + ECS + Supabase topology supersedes the original VM/Compose hosting proposal. Disposable Compose environments remain the reproducible test/restore topology. Production must stay inert until the later release gates pass.

**Accepted on 2026-09-25.** [acceptance.json](acceptance.json) records each required gate and its evidence. Final code CI passed; actual secret recovery, managed signing certificate health, four PDF signatures, backup/restore and cleanup checks pass. The certificate is self-signed for staging, not a production-trusted signing identity. See [OPERATIONS.md](OPERATIONS.md) for recovery/rotation procedures and later production gates. Earlier documents contain chronological progress records, not current outstanding-work lists.
