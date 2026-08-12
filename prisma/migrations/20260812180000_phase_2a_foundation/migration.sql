-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Citizen', 'Manager', 'Crew');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'in-progress', 'resolved');

-- CreateEnum
CREATE TYPE "ReportSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('report-photo', 'completion-evidence', 'avatar');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('Under Review', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('pending', 'active', 'completed');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('Low', 'Medium', 'High');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "employeeId" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "avatarUrl" TEXT,
    "districtId" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arabicName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "departmentId" TEXT,
    "districtId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "severity" "ReportSeverity",
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "importedVoteBaseline" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "uploadedById" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_votes" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "districtId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'Under Review',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "importedVoteBaseline" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestion_votes" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'pending',
    "locationText" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_assignments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "crewUserId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_status_history" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_status_history" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "WorkOrderStatus",
    "toStatus" "WorkOrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "users"
    ADD CONSTRAINT "users_name_nonblank" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "users_phone_nonblank" CHECK ("phone" IS NULL OR btrim("phone") <> ''),
    ADD CONSTRAINT "users_employee_id_nonblank" CHECK ("employeeId" IS NULL OR btrim("employeeId") <> ''),
    ADD CONSTRAINT "users_password_hash_nonblank" CHECK ("passwordHash" IS NULL OR btrim("passwordHash") <> '');

-- AddCheckConstraint
ALTER TABLE "departments"
    ADD CONSTRAINT "departments_name_nonblank" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "departments_description_nonblank" CHECK ("description" IS NULL OR btrim("description") <> '');

-- AddCheckConstraint
ALTER TABLE "districts"
    ADD CONSTRAINT "districts_id_nonblank" CHECK (btrim("id") <> ''),
    ADD CONSTRAINT "districts_name_nonblank" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "districts_arabic_name_nonblank" CHECK (btrim("arabicName") <> '');

-- AddCheckConstraint
ALTER TABLE "reports"
    ADD CONSTRAINT "reports_title_nonblank" CHECK (btrim("title") <> ''),
    ADD CONSTRAINT "reports_description_nonblank" CHECK (btrim("description") <> ''),
    ADD CONSTRAINT "reports_category_nonblank" CHECK (btrim("category") <> ''),
    ADD CONSTRAINT "reports_latitude_valid" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "reports_longitude_valid" CHECK ("longitude" BETWEEN -180 AND 180),
    ADD CONSTRAINT "reports_imported_vote_baseline_nonnegative" CHECK ("importedVoteBaseline" >= 0);

-- AddCheckConstraint
ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_name_nonblank" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "attachments_mime_type_nonblank" CHECK (btrim("mimeType") <> ''),
    ADD CONSTRAINT "attachments_url_nonblank" CHECK (btrim("url") <> '');

-- AddCheckConstraint
ALTER TABLE "suggestions"
    ADD CONSTRAINT "suggestions_title_nonblank" CHECK (btrim("title") <> ''),
    ADD CONSTRAINT "suggestions_description_nonblank" CHECK (btrim("description") <> ''),
    ADD CONSTRAINT "suggestions_category_nonblank" CHECK (btrim("category") <> ''),
    ADD CONSTRAINT "suggestions_latitude_valid" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "suggestions_longitude_valid" CHECK ("longitude" BETWEEN -180 AND 180),
    ADD CONSTRAINT "suggestions_imported_vote_baseline_nonnegative" CHECK ("importedVoteBaseline" >= 0);

-- AddCheckConstraint
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_title_nonblank" CHECK (btrim("title") <> ''),
    ADD CONSTRAINT "work_orders_description_nonblank" CHECK (btrim("description") <> ''),
    ADD CONSTRAINT "work_orders_location_text_nonblank" CHECK ("locationText" IS NULL OR btrim("locationText") <> '');

-- AddCheckConstraint
ALTER TABLE "report_status_history"
    ADD CONSTRAINT "report_status_history_note_nonblank" CHECK ("note" IS NULL OR btrim("note") <> '');

-- AddCheckConstraint
ALTER TABLE "work_order_status_history"
    ADD CONSTRAINT "work_order_status_history_note_nonblank" CHECK ("note" IS NULL OR btrim("note") <> '');

-- AddCheckConstraint
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_action_nonblank" CHECK (btrim("action") <> ''),
    ADD CONSTRAINT "audit_logs_entity_type_nonblank" CHECK (btrim("entityType") <> ''),
    ADD CONSTRAINT "audit_logs_entity_id_nonblank" CHECK (btrim("entityId") <> '');

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_districtId_idx" ON "users"("districtId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "districts_name_key" ON "districts"("name");

-- CreateIndex
CREATE INDEX "reports_authorId_idx" ON "reports"("authorId");

-- CreateIndex
CREATE INDEX "reports_departmentId_idx" ON "reports"("departmentId");

-- CreateIndex
CREATE INDEX "reports_districtId_idx" ON "reports"("districtId");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_category_idx" ON "reports"("category");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_reportId_idx" ON "attachments"("reportId");

-- CreateIndex
CREATE INDEX "attachments_workOrderId_idx" ON "attachments"("workOrderId");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "attachments_kind_idx" ON "attachments"("kind");

-- CreateIndex
CREATE INDEX "report_votes_userId_idx" ON "report_votes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "report_votes_reportId_userId_key" ON "report_votes"("reportId", "userId");

-- CreateIndex
CREATE INDEX "suggestions_authorId_idx" ON "suggestions"("authorId");

-- CreateIndex
CREATE INDEX "suggestions_districtId_idx" ON "suggestions"("districtId");

-- CreateIndex
CREATE INDEX "suggestions_category_idx" ON "suggestions"("category");

-- CreateIndex
CREATE INDEX "suggestions_status_idx" ON "suggestions"("status");

-- CreateIndex
CREATE INDEX "suggestions_createdAt_idx" ON "suggestions"("createdAt");

-- CreateIndex
CREATE INDEX "suggestion_votes_userId_idx" ON "suggestion_votes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "suggestion_votes_suggestionId_userId_key" ON "suggestion_votes"("suggestionId", "userId");

-- CreateIndex
CREATE INDEX "work_orders_reportId_idx" ON "work_orders"("reportId");

-- CreateIndex
CREATE INDEX "work_orders_departmentId_idx" ON "work_orders"("departmentId");

-- CreateIndex
CREATE INDEX "work_orders_createdById_idx" ON "work_orders"("createdById");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_priority_idx" ON "work_orders"("priority");

-- CreateIndex
CREATE INDEX "work_orders_createdAt_idx" ON "work_orders"("createdAt");

-- CreateIndex
CREATE INDEX "crew_assignments_crewUserId_assignedAt_idx" ON "crew_assignments"("crewUserId", "assignedAt");

-- CreateIndex
CREATE INDEX "crew_assignments_assignedById_idx" ON "crew_assignments"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "crew_assignments_workOrderId_crewUserId_key" ON "crew_assignments"("workOrderId", "crewUserId");

-- CreateIndex
CREATE INDEX "report_status_history_reportId_createdAt_idx" ON "report_status_history"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "report_status_history_actorId_idx" ON "report_status_history"("actorId");

-- CreateIndex
CREATE INDEX "work_order_status_history_workOrderId_createdAt_idx" ON "work_order_status_history"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "work_order_status_history_actorId_idx" ON "work_order_status_history"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_crewUserId_fkey" FOREIGN KEY ("crewUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
