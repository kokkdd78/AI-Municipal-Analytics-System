BEGIN;

-- Refuse the migration before changing the schema if existing attachment
-- relationships do not satisfy the new composite identity.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attachments" AS a
    LEFT JOIN "reports" AS r ON r."id" = a."reportId"
    LEFT JOIN "work_orders" AS w ON w."id" = a."workOrderId"
    WHERE r."id" IS NULL
       OR (a."workOrderId" IS NOT NULL AND w."id" IS NULL)
       OR (a."workOrderId" IS NOT NULL AND a."reportId" <> w."reportId")
  ) THEN
    RAISE EXCEPTION 'Attachment integrity preflight failed';
  END IF;
END $$;

-- A work order is identified together with the report it belongs to.
ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_id_reportId_key" UNIQUE ("id", "reportId");

-- The nullable mirror permits ON DELETE SET NULL to preserve report
-- attachments when their work order is deleted.
ALTER TABLE "attachments"
  ADD COLUMN "workOrderReportId" TEXT;

UPDATE "attachments"
SET "workOrderReportId" = "reportId"
WHERE "workOrderId" IS NOT NULL;

ALTER TABLE "attachments"
  DROP CONSTRAINT "attachments_workOrderId_fkey";

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_work_order_report_consistent" CHECK (
    ("workOrderId" IS NULL AND "workOrderReportId" IS NULL)
    OR
    (
      "workOrderId" IS NOT NULL
      AND "workOrderReportId" IS NOT NULL
      AND "workOrderReportId" = "reportId"
    )
  );

CREATE INDEX "attachments_workOrderId_workOrderReportId_idx"
  ON "attachments"("workOrderId", "workOrderReportId");

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_workOrderId_workOrderReportId_fkey"
  FOREIGN KEY ("workOrderId", "workOrderReportId")
  REFERENCES "work_orders"("id", "reportId")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

COMMIT;
