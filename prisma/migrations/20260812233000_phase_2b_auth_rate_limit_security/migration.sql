-- Persist Better Auth rate-limit counters so limits survive process and instance changes.
CREATE TABLE "auth_rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_rate_limits_key_nonblank_check" CHECK (btrim("key") <> ''),
    CONSTRAINT "auth_rate_limits_count_nonnegative_check" CHECK ("count" >= 0),
    CONSTRAINT "auth_rate_limits_last_request_nonnegative_check" CHECK ("lastRequest" >= 0)
);

CREATE UNIQUE INDEX "auth_rate_limits_key_key" ON "auth_rate_limits"("key");
CREATE INDEX "auth_rate_limits_lastRequest_idx" ON "auth_rate_limits"("lastRequest");
