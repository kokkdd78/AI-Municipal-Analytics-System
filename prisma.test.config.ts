import "dotenv/config"

import { defineConfig } from "prisma/config"
import { requireSafeTestDatabaseUrl } from "./lib/db/test-database-url"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts --test",
  },
  datasource: {
    url: requireSafeTestDatabaseUrl(),
  },
})
