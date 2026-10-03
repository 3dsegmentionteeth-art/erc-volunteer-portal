-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "full_name_en" TEXT NOT NULL,
    "full_name_ar" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'branch_admin',
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "english_name" TEXT NOT NULL,
    "arabic_name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "organization" TEXT,
    "id_number" TEXT,
    "skills" JSONB,
    "certifications" JSONB,
    "education_info" TEXT,
    "application_answers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "volunteer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteers" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "english_name" TEXT NOT NULL,
    "arabic_name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "organization" TEXT,
    "education_info" TEXT,
    "skills" JSONB,
    "certifications" JSONB,
    "id_number" TEXT,
    "application_answers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approved_at" TIMESTAMP(3),
    "registration_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_time_records" (
    "id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'add_request',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_time_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_add_requests" (
    "id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "assigned_admin_id" TEXT,
    "date" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "record_id" TEXT,

    CONSTRAINT "time_add_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_edit_requests" (
    "id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "assigned_admin_id" TEXT,
    "requested_date" DATE NOT NULL,
    "requested_event" TEXT NOT NULL,
    "requested_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "original_date" DATE NOT NULL,
    "original_event" TEXT NOT NULL,
    "original_minutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_time_adjustments" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "delta_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_time_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "branch_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "volunteer_id" TEXT,
    "registration_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_id" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_references" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "verification_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");

-- CreateIndex
CREATE INDEX "admins_branch_id_idx" ON "admins"("branch_id");

-- CreateIndex
CREATE INDEX "admins_role_idx" ON "admins"("role");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_email_key" ON "registrations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_volunteer_id_key" ON "registrations"("volunteer_id");

-- CreateIndex
CREATE INDEX "registrations_branch_id_idx" ON "registrations"("branch_id");

-- CreateIndex
CREATE INDEX "registrations_status_idx" ON "registrations"("status");

-- CreateIndex
CREATE INDEX "registrations_email_idx" ON "registrations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "volunteers_code_key" ON "volunteers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "volunteers_email_key" ON "volunteers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "volunteers_registration_id_key" ON "volunteers"("registration_id");

-- CreateIndex
CREATE INDEX "volunteers_branch_id_idx" ON "volunteers"("branch_id");

-- CreateIndex
CREATE INDEX "volunteers_status_idx" ON "volunteers"("status");

-- CreateIndex
CREATE INDEX "volunteers_english_name_idx" ON "volunteers"("english_name");

-- CreateIndex
CREATE INDEX "volunteers_arabic_name_idx" ON "volunteers"("arabic_name");

-- CreateIndex
CREATE INDEX "service_time_records_volunteer_id_idx" ON "service_time_records"("volunteer_id");

-- CreateIndex
CREATE INDEX "service_time_records_branch_id_idx" ON "service_time_records"("branch_id");

-- CreateIndex
CREATE INDEX "service_time_records_date_idx" ON "service_time_records"("date");

-- CreateIndex
CREATE UNIQUE INDEX "time_add_requests_record_id_key" ON "time_add_requests"("record_id");

-- CreateIndex
CREATE INDEX "time_add_requests_volunteer_id_idx" ON "time_add_requests"("volunteer_id");

-- CreateIndex
CREATE INDEX "time_add_requests_branch_id_idx" ON "time_add_requests"("branch_id");

-- CreateIndex
CREATE INDEX "time_add_requests_assigned_admin_id_idx" ON "time_add_requests"("assigned_admin_id");

-- CreateIndex
CREATE INDEX "time_add_requests_status_idx" ON "time_add_requests"("status");

-- CreateIndex
CREATE INDEX "time_edit_requests_volunteer_id_idx" ON "time_edit_requests"("volunteer_id");

-- CreateIndex
CREATE INDEX "time_edit_requests_record_id_idx" ON "time_edit_requests"("record_id");

-- CreateIndex
CREATE INDEX "time_edit_requests_branch_id_idx" ON "time_edit_requests"("branch_id");

-- CreateIndex
CREATE INDEX "time_edit_requests_assigned_admin_id_idx" ON "time_edit_requests"("assigned_admin_id");

-- CreateIndex
CREATE INDEX "time_edit_requests_status_idx" ON "time_edit_requests"("status");

-- CreateIndex
CREATE INDEX "admin_time_adjustments_admin_id_idx" ON "admin_time_adjustments"("admin_id");

-- CreateIndex
CREATE INDEX "admin_time_adjustments_volunteer_id_idx" ON "admin_time_adjustments"("volunteer_id");

-- CreateIndex
CREATE INDEX "admin_time_adjustments_branch_id_idx" ON "admin_time_adjustments"("branch_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_idx" ON "audit_logs"("branch_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "documents_volunteer_id_idx" ON "documents"("volunteer_id");

-- CreateIndex
CREATE INDEX "documents_registration_id_idx" ON "documents"("registration_id");

-- CreateIndex
CREATE INDEX "documents_branch_id_idx" ON "documents"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_references_ref_key" ON "verification_references"("ref");

-- CreateIndex
CREATE INDEX "verification_references_scope_idx" ON "verification_references"("scope");

-- CreateIndex
CREATE INDEX "email_verifications_volunteer_id_idx" ON "email_verifications"("volunteer_id");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_time_records" ADD CONSTRAINT "service_time_records_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_time_records" ADD CONSTRAINT "service_time_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_add_requests" ADD CONSTRAINT "time_add_requests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_add_requests" ADD CONSTRAINT "time_add_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_add_requests" ADD CONSTRAINT "time_add_requests_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_add_requests" ADD CONSTRAINT "time_add_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_add_requests" ADD CONSTRAINT "time_add_requests_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "service_time_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_edit_requests" ADD CONSTRAINT "time_edit_requests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_edit_requests" ADD CONSTRAINT "time_edit_requests_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "service_time_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_edit_requests" ADD CONSTRAINT "time_edit_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_edit_requests" ADD CONSTRAINT "time_edit_requests_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_edit_requests" ADD CONSTRAINT "time_edit_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_time_adjustments" ADD CONSTRAINT "admin_time_adjustments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_time_adjustments" ADD CONSTRAINT "admin_time_adjustments_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_time_adjustments" ADD CONSTRAINT "admin_time_adjustments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_time_adjustments" ADD CONSTRAINT "admin_time_adjustments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "service_time_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
