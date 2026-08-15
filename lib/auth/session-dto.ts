import type { UserRole } from "../../generated/prisma/client"
import { roleHome } from "./route-policy"

export interface SafeMunicipalUserDto {
  id: string
  name: string
  role: UserRole
  phone: string | null
  avatarUrl: string | null
  district: { id: string; name: string } | null
  departmentId: string | null
}

export interface SafeAuthenticationDto {
  user: SafeMunicipalUserDto
  destination: string
}

export interface SafeUserRecord {
  id: string
  name: string
  role: UserRole
  phone: string | null
  avatarUrl: string | null
  departmentId: string | null
  district: { id: string; name: string } | null
}

export function toSafeAuthenticationDto(user: SafeUserRecord): SafeAuthenticationDto {
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      phone: user.role === "Citizen" ? user.phone : null,
      avatarUrl: user.avatarUrl,
      district: user.district,
      departmentId: user.departmentId,
    },
    destination: roleHome(user.role),
  }
}
