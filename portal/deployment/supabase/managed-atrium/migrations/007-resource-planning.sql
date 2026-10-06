-- Internal planning data is separate from client-visible project/member records.
CREATE TABLE gc_atrium.project_budget (
 "projectId" text PRIMARY KEY REFERENCES gc_atrium.project(id) ON DELETE CASCADE,
 "retainerCents" integer NOT NULL CHECK ("retainerCents" BETWEEN 0 AND 1000000000),
 "targetRateCents" integer NOT NULL CHECK ("targetRateCents" BETWEEN 1 AND 100000000),
 "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gc_atrium.member_capacity (
 "memberId" text PRIMARY KEY REFERENCES gc_atrium.member(id) ON DELETE CASCADE,
 "capacityMinutes" integer NOT NULL CHECK ("capacityMinutes" BETWEEN 0 AND 44640),
 "costRateCents" integer NOT NULL CHECK ("costRateCents" BETWEEN 0 AND 100000000),
 "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gc_atrium.project_staff (
 "projectId" text NOT NULL REFERENCES gc_atrium.project(id) ON DELETE CASCADE,
 "memberId" text NOT NULL REFERENCES gc_atrium.member(id) ON DELETE CASCADE,
 "allocatedMinutes" integer NOT NULL CHECK ("allocatedMinutes" BETWEEN 0 AND 44640),
 "costRateCents" integer NOT NULL CHECK ("costRateCents" BETWEEN 0 AND 100000000),
 "updatedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("projectId", "memberId")
);
CREATE INDEX project_staff_member_idx ON gc_atrium.project_staff ("memberId");
REVOKE ALL ON gc_atrium.project_budget, gc_atrium.member_capacity, gc_atrium.project_staff FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_atrium.project_budget, gc_atrium.member_capacity, gc_atrium.project_staff TO gc_app;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_backup') THEN GRANT SELECT ON gc_atrium.project_budget, gc_atrium.member_capacity, gc_atrium.project_staff TO gc_backup; END IF; END $$;
