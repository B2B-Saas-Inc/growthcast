# Missing project status controls

The retained GrowthCast review organization was created directly by `review-accounts/create.mjs`, which omitted the four `project_status` rows normally created by `AuthService.seedOrganizationDefaults`. Projects still received `status = not_started`, but the UI rendered its status buttons from an empty `/projects/statuses` response. Consequently there was no visible way to change status.

The scoped repair uses the restricted `gc_app` identity, verifies the expected owner, locks the exact review organization and refuses to overwrite existing status options. It inserts only the four standard options (Not Started, In Progress, In Review, Completed). No project rows or current statuses are changed. Temporary credentials are deleted on completion. The review-account provisioning source now seeds the same defaults so this omission does not recur.

Desktop: open a project and select a status in the left sidebar. Mobile: expand **Details**, then choose a status. Archived projects must be unarchived before changing their status. This uses the existing owner/admin project update API and validation; no application redeployment or schema migration is needed.

Evidence: `repair-evidence.json` and `verification.json` (independent read-only database check; existing desktop/mobile UI and update handler reviewed in source). The retained local admin password was rejected, so authenticated browser verification was not completed. No password reset was attempted.
