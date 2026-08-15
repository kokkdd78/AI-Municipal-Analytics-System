import "server-only"

import { prisma } from "@/lib/db/prisma"
import { createMunicipalAuth } from "./config"
import { readAuthRuntimeEnvironment } from "./environment"

export const auth = createMunicipalAuth({ database: prisma, ...readAuthRuntimeEnvironment() })
