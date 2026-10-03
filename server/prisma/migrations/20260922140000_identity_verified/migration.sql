-- Phase 5: volunteer identity verification flag.
-- Set by an administrator after reviewing the volunteer's identities/approved
-- documents. Joins the 10-check profile-completion gate for time requests;
-- volunteers cannot reach 100% (and time requests stay locked) without it.

ALTER TABLE "volunteers" ADD COLUMN "identity_verified" BOOLEAN NOT NULL DEFAULT false;