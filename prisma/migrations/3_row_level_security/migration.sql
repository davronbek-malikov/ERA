-- Defence in depth (docs/ERA_STUDENT_MANAGEMENT.md, "Row Level Security").
--
-- ERA reads and writes through Prisma, connected as the table owner. Owners are not subject to RLS
-- unless it is FORCED, so the application is unaffected. Supabase additionally exposes every table in
-- the public schema through its Data API (PostgREST) to the `anon` and `authenticated` roles. With RLS
-- enabled and no policies, those roles can read and change nothing: payments, notes, users and every other
-- table stay reachable only through ERA's server, where src/server/authz.ts decides access.
--
-- Not FORCE: the owner (the application) keeps full access. Tables created by later migrations must enable
-- RLS themselves.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
