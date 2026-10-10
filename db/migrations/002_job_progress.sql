-- Live progress for running Positioning Wizard jobs, so the UI can show which stage is running.
-- Additive and idempotent.
alter table wizard.jobs add column if not exists progress jsonb;
