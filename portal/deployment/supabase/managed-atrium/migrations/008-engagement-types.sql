-- Existing budgets retain their current recurring interpretation.
ALTER TABLE gc_atrium.project_budget ADD COLUMN "engagementType" text NOT NULL DEFAULT 'retainer' CHECK ("engagementType" IN ('retainer','hourly','flat_fee'));
