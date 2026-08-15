-- Add nullable authentication identifiers first so existing municipal users can be backfilled safely.
ALTER TABLE "users"
  ADD COLUMN "authDisplayUsername" TEXT,
  ADD COLUMN "authEmail" TEXT,
  ADD COLUMN "authUsername" TEXT,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Existing users remain passwordless. This deterministic internal address is not a login credential.
UPDATE "users"
   SET "authEmail" = 'existing-' || md5("id") || '@auth.invalid'
 WHERE "authEmail" IS NULL;

ALTER TABLE "users" ALTER COLUMN "authEmail" SET NOT NULL;

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");
CREATE UNIQUE INDEX "auth_accounts_providerId_accountId_key" ON "auth_accounts"("providerId", "accountId");
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications"("identifier");
CREATE INDEX "auth_verifications_expiresAt_idx" ON "auth_verifications"("expiresAt");
CREATE UNIQUE INDEX "users_authEmail_key" ON "users"("authEmail");
CREATE UNIQUE INDEX "users_authUsername_key" ON "users"("authUsername");
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

ALTER TABLE "users"
  ADD CONSTRAINT "users_authEmail_nonblank_check" CHECK (btrim("authEmail") <> ''),
  ADD CONSTRAINT "users_authUsername_nonblank_check" CHECK ("authUsername" IS NULL OR btrim("authUsername") <> '');

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_accounts"
  ADD CONSTRAINT "auth_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
