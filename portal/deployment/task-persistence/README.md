# Authenticated task-replacement acceptance

This bounded staging check uses a separate pre-verified synthetic organization, client and file. It leaves the retained GrowthCast review accounts untouched. The fixture driver uses the pinned restricted runtime connection; its separate read-only backup connection hashes all 52 Atrium tables before and after cleanup. Secrets and cookie bindings stay in a mode-0700 temporary directory and never enter receipts.

Sequence: `fixture.py seed`, `interact.py`, `verify.py before`, `replacement.py`, `verify.py after`, `fixture.py cleanup`. Browser helpers use a short-lived same-project Vercel OIDC header scoped to the canonical origin. Mount this directory at `/work` in the existing pinned browser image. A second invocation of replacement resumes only a STARTING receipt; it must not request another deployment.

The rolling ECS replacement keeps the existing service desired count and minimum healthy percentage. Acceptance requires the prior task to be STOPPED, a different task to be HEALTHY, and the deployment to be completed. The post-replacement browser check must retain the exact session ID and session-cookie hash, reload the authenticated server-rendered page without logging in, find the same project/file IDs, download byte-identical private content, deny another organization's project, then log out.

`evidence.json` records these checks; `cleanup-evidence.json` records the independent before/after database comparison and empty synthetic Storage prefix. Email verification, managed signing, whole-project restore and production-volume recovery objectives are outside this check.
