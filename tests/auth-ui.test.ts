import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8")
}

describe("Phase 2B2B authentication UI boundaries", () => {
  it("uses the server session as the only AuthContext role authority", () => {
    const authContext = source("context/auth-context.tsx")

    expect(authContext).toContain("useState<SafeMunicipalUser | null>(null)")
    expect(authContext).toContain("useState(true)")
    expect(authContext).toContain("userRole: user?.role ?? null")
    expect(authContext).toContain("getMunicipalSession")
    expect(authContext).toContain("requestSequenceRef")
    expect(authContext).toContain("signOutPromiseRef")
    expect(authContext).not.toMatch(/setUserRole|storedState\.role|localStorage/)
  })

  it("removes OTP and submits only the intended citizen and staff operations", () => {
    const citizenLogin = source("components/login-screen.tsx")
    const registration = source("components/sign-up-screen.tsx")
    const staffLogin = source("components/employee-login-screen.tsx")

    expect(citizenLogin).toContain("loginCitizen")
    expect(registration).toContain("registerCitizen")
    expect(registration).toContain("JEDDAH_DISTRICTS.map")
    expect(staffLogin).toContain("loginStaff")
    expect(citizenLogin).toContain('operationGate.begin("citizen-login")')
    expect(citizenLogin).toContain("operationGate.canSwitchMode()")
    expect(citizenLogin).toContain("operationGate.commitNavigation(operationToken)")
    expect(registration).toContain('operationGate.begin("citizen-register")')
    expect(registration).toContain("operationGate.canSwitchMode()")
    expect(registration).toContain("operationToken.signal")
    expect([citizenLogin, registration, staffLogin].join("\n")).not.toMatch(/InputOTP|setUserRole|showOtp|verification code/i)
    expect(staffLogin).not.toMatch(/employeeRole|setEmployeeRole|role selector/i)
    for (const form of [citizenLogin, registration, staffLogin]) {
      expect(form).toContain("isSubmitting || submissionRef.current")
      expect(form).toContain("submissionRef.current = true")
      expect(form).toContain("disabled={isSubmitting")
      expect(form).toContain("router.replace(confirmed.data.destination)")
      expect(form).toContain("router.refresh()")
    }
  })

  it("unifies logout and keeps local municipal data outside component logout paths", () => {
    for (const path of [
      "components/profile-screen.tsx",
      "components/manager-dashboard.tsx",
      "components/crew-task-list.tsx",
    ]) {
      const component = source(path)
      expect(component).toContain("await signOut()")
      expect(component).toContain('router.replace("/auth")')
      expect(component).not.toMatch(/setUserRole|clearAppSession|localStorage|removeItem/)
    }
  })

  it("binds DataContext to the exact authenticated Citizen ID", () => {
    const dataContext = source("context/data-context.tsx")

    expect(dataContext).toContain("getProfileForAuthenticatedUser(storedState, authenticatedUser.id)")
    expect(dataContext).toContain("updateProfileForAuthenticatedUser(authenticatedUser.id, updates)")
    expect(dataContext).toContain("authorId: authenticatedUser.id")
    expect(dataContext).toContain('authenticatedUser?.role === "Citizen"')
    expect(dataContext).not.toContain("DEFAULT_USER")
  })
})
