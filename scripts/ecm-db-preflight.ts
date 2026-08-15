import "dotenv/config"

import { neon } from "@neondatabase/serverless"

const ECM_MIGRATION = "20260816120000_ecm_archiving_mvp"
const postflight = process.argv.includes("--postflight")

function requireDirectUrl(): string {
  const value = process.env.DIRECT_URL?.trim()
  if (!value) throw new Error("ECM database preflight configuration is invalid")
  return value
}

async function main(): Promise<void> {
  const sql = neon(requireDirectUrl())
  const [tableRows, migrationRows, constraintRows, indexRows, userRows, reportRows, attachmentRows, suggestionRows, voteRows, workOrderRows, assignmentRows] = await Promise.all([
    sql.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('archive_records', 'archive_audit_events')`, []),
    sql.query(`SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied FROM "_prisma_migrations" WHERE migration_name = $1`, [ECM_MIGRATION]),
    sql.query(`SELECT conname FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conrelid IN (to_regclass('archive_records'), to_regclass('archive_audit_events'))`, []),
    sql.query(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('archive_records', 'archive_audit_events')`, []),
    sql.query(`SELECT count(*)::int AS count FROM users`, []),
    sql.query(`SELECT count(*)::int AS count FROM reports`, []),
    sql.query(`SELECT count(*)::int AS count FROM attachments`, []),
    sql.query(`SELECT count(*)::int AS count FROM suggestions`, []),
    sql.query(`SELECT count(*)::int AS count FROM report_votes`, []),
    sql.query(`SELECT count(*)::int AS count FROM work_orders`, []),
    sql.query(`SELECT count(*)::int AS count FROM crew_assignments`, []),
  ])

  const tables = tableRows as unknown as { table_name: string }[]
  const migrations = migrationRows as unknown as { migration_name: string; applied: boolean }[]
  const constraints = new Set((constraintRows as unknown as { conname: string }[]).map((row) => row.conname))
  const indexes = new Set((indexRows as unknown as { indexname: string }[]).map((row) => row.indexname))
  const count = (rows: unknown): number => Number((rows as { count: number }[])[0]?.count ?? 0)
  const applied = migrations[0]?.migration_name === ECM_MIGRATION && migrations[0]?.applied === true
  const expectedConstraints = [
    "archive_records_pkey", "archive_records_ecm_record_number_nonblank", "archive_records_report_title_nonblank", "archive_records_district_name_nonblank", "archive_records_storage_key_nonblank", "archive_records_document_url_https", "archive_records_checksum_sha256", "archive_records_provider_nonblank", "archive_records_retention_after_archive", "archive_records_reportId_fkey", "archive_records_archivedById_fkey", "archive_audit_events_pkey", "archive_audit_events_archiveRecordId_fkey", "archive_audit_events_actorId_fkey",
  ]
  const expectedIndexes = [
    "archive_records_pkey", "archive_records_ecmRecordNumber_key", "archive_records_reportId_key", "archive_records_storageKey_key", "archive_records_archivedAt_idx", "archive_records_retentionUntil_idx", "archive_records_status_idx", "archive_records_reportTitle_idx", "archive_records_districtName_idx", "archive_audit_events_pkey", "archive_audit_events_archiveRecordId_createdAt_idx", "archive_audit_events_actorId_createdAt_idx",
  ]
  const archiveStructureValid = expectedConstraints.every((name) => constraints.has(name)) && expectedIndexes.every((name) => indexes.has(name))
  const result = {
    ecmMigrationApplied: applied,
    ecmTableCount: tables.length,
    archiveStructureValid: postflight ? archiveStructureValid : tables.length === 0 && constraints.size === 0 && indexes.size === 0,
    municipalCounts: {
      users: count(userRows), reports: count(reportRows), attachments: count(attachmentRows), suggestions: count(suggestionRows), votes: count(voteRows), workOrders: count(workOrderRows), assignments: count(assignmentRows),
    },
  }

  if ((!postflight && (applied || tables.length !== 0 || constraints.size !== 0 || indexes.size !== 0)) || (postflight && (!applied || tables.length !== 2 || !archiveStructureValid))) {
    throw new Error("ECM database preflight state is unexpected")
  }
  console.log(JSON.stringify(result))
}

void main().catch(() => {
  console.error("ECM database preflight failed")
  process.exitCode = 1
})
