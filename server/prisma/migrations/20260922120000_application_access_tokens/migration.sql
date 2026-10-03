-- Application-access token for attaching documents to a *pending* registration.
-- Same shape as email_verifications: sha256 digest only (raw token never
-- persisted), expires_at, used_at. Burned at decision (approve/reject).

CREATE TABLE "application_access_tokens" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "application_access_tokens_registration_id_idx" ON "application_access_tokens"("registration_id");

CREATE INDEX "application_access_tokens_token_hash_idx" ON "application_access_tokens"("token_hash");

ALTER TABLE "application_access_tokens" ADD CONSTRAINT "application_access_tokens_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;