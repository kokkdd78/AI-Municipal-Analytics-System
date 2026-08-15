-- Add immutable ECM archive metadata and append-only archive audit events.
CREATE TYPE "ArchiveStatus" AS ENUM ('archived');
CREATE TYPE "ArchiveAuditEventType" AS ENUM ('archived', 'viewed', 'integrity-verified', 'integrity-failed');

CREATE TABLE "archive_records" (
    "id" TEXT NOT NULL,
    "ecmRecordNumber" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reportTitle" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "storageKey" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ArchiveStatus" NOT NULL DEFAULT 'archived',
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "archivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archive_records_ecm_record_number_nonblank" CHECK (btrim("ecmRecordNumber") <> ''),
    CONSTRAINT "archive_records_report_title_nonblank" CHECK (btrim("reportTitle") <> ''),
    CONSTRAINT "archive_records_district_name_nonblank" CHECK (btrim("districtName") <> ''),
    CONSTRAINT "archive_records_storage_key_nonblank" CHECK (btrim("storageKey") <> ''),
    CONSTRAINT "archive_records_document_url_https" CHECK ("documentUrl" ~ '^https://'),
    CONSTRAINT "archive_records_checksum_sha256" CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "archive_records_provider_nonblank" CHECK (btrim("provider") <> ''),
    CONSTRAINT "archive_records_retention_after_archive" CHECK ("retentionUntil" > "archivedAt")
);

CREATE TABLE "archive_audit_events" (
    "id" TEXT NOT NULL,
    "archiveRecordId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ArchiveAuditEventType" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "archive_records_ecmRecordNumber_key" ON "archive_records"("ecmRecordNumber");
CREATE UNIQUE INDEX "archive_records_reportId_key" ON "archive_records"("reportId");
CREATE UNIQUE INDEX "archive_records_storageKey_key" ON "archive_records"("storageKey");
CREATE INDEX "archive_records_archivedAt_idx" ON "archive_records"("archivedAt");
CREATE INDEX "archive_records_retentionUntil_idx" ON "archive_records"("retentionUntil");
CREATE INDEX "archive_records_status_idx" ON "archive_records"("status");
CREATE INDEX "archive_records_reportTitle_idx" ON "archive_records"("reportTitle");
CREATE INDEX "archive_records_districtName_idx" ON "archive_records"("districtName");
CREATE INDEX "archive_audit_events_archiveRecordId_createdAt_idx" ON "archive_audit_events"("archiveRecordId", "createdAt");
CREATE INDEX "archive_audit_events_actorId_createdAt_idx" ON "archive_audit_events"("actorId", "createdAt");

ALTER TABLE "archive_records" ADD CONSTRAINT "archive_records_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "archive_records" ADD CONSTRAINT "archive_records_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "archive_audit_events" ADD CONSTRAINT "archive_audit_events_archiveRecordId_fkey" FOREIGN KEY ("archiveRecordId") REFERENCES "archive_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_audit_events" ADD CONSTRAINT "archive_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
