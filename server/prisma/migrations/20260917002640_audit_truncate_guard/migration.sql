-- Close the last gap in the append-only guarantee: row-level
-- BEFORE UPDATE/DELETE triggers do NOT fire for TRUNCATE, so any actor able to
-- truncate could wipe the audit trail while it "looked" protected. This
-- statement-level trigger makes TRUNCATE fail too.
--
-- Test fixtures legitimately reset the whole test DB between runs, so they
-- DISABLE this trigger around their own TRUNCATE (tests/helpers.ts) — that
-- requires DB TRIGGER privilege and is not reachable through the API.

CREATE OR REPLACE FUNCTION fn_audit_logs_no_truncate() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: TRUNCATE is not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_truncate
    BEFORE TRUNCATE ON "audit_logs"
    FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_logs_no_truncate();