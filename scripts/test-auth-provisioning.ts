import { hashPassword } from "better-auth/crypto"
import { PrismaNeon } from "@prisma/adapter-neon"

import { PrismaClient, UserRole } from "../generated/prisma/client.ts"
import { deriveCitizenAuthIdentity, deriveStaffAuthIdentity } from "../lib/auth/identifiers.ts"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url.ts"

async function provisionCredential(
  database: PrismaClient,
  userId: string,
  password: string,
  citizenPhone?: string,
): Promise<void> {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Test credential provisioning was refused")
  }

  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      phone: true,
      employeeId: true,
      authUsername: true,
      authDisplayUsername: true,
      authAccounts: { where: { providerId: "credential" }, select: { id: true } },
    },
  })
  if (!user || user.authUsername || user.authDisplayUsername || user.authAccounts.length > 0) {
    throw new Error("Test credential provisioning was refused")
  }

  const identity =
    user.role === UserRole.Citizen
      ? deriveCitizenAuthIdentity(user.phone ?? citizenPhone)
      : deriveStaffAuthIdentity(user.employeeId)
  if (
    user.phone &&
    citizenPhone &&
    deriveCitizenAuthIdentity(user.phone).username !== deriveCitizenAuthIdentity(citizenPhone).username
  ) {
    throw new Error("Test credential provisioning was refused")
  }
  const passwordDigest = await hashPassword(password)

  await database.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: user.id, authUsername: null, authDisplayUsername: null },
      data: {
        authUsername: identity.username,
        authDisplayUsername: identity.displayUsername,
        ...(user.role === UserRole.Citizen ? { phone: identity.normalizedIdentifier } : {}),
      },
    })
    if (updated.count !== 1) throw new Error("Test credential provisioning was refused")

    await transaction.authAccount.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordDigest,
      },
    })
  })
}

export async function provisionTestCredential(
  userId: string,
  password: string,
  citizenPhone?: string,
): Promise<void> {
  const connectionString = requireSafeTestDatabaseUrl()
  const database = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })

  try {
    await provisionCredential(database, userId, password, citizenPhone)
  } finally {
    await database.$disconnect()
  }
}
