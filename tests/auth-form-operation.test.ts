import { describe, expect, it } from "vitest"

import { createAuthenticationOperationGate } from "../lib/auth/form-operation"

describe("Phase 2B2B authentication form operation gate", () => {
  it("blocks a registration mode switch and second request while Citizen login is pending", () => {
    const gate = createAuthenticationOperationGate()
    let mode = "citizen-login"
    let requestCount = 0

    const login = gate.begin("citizen-login")
    if (login) requestCount += 1

    if (gate.canSwitchMode()) mode = "citizen-register"
    const registration = gate.begin("citizen-register")
    if (registration) requestCount += 1

    expect(login).not.toBeNull()
    expect(mode).toBe("citizen-login")
    expect(registration).toBeNull()
    expect(requestCount).toBe(1)
  })

  it("blocks back-to-login navigation and a second request while registration is pending", () => {
    const gate = createAuthenticationOperationGate()
    let mode = "citizen-register"
    let requestCount = 0

    const registration = gate.begin("citizen-register")
    if (registration) requestCount += 1

    if (gate.canSwitchMode()) mode = "citizen-login"
    const login = gate.begin("citizen-login")
    if (login) requestCount += 1

    expect(registration).not.toBeNull()
    expect(mode).toBe("citizen-register")
    expect(login).toBeNull()
    expect(requestCount).toBe(1)
  })

  it("synchronously rejects rapid double submission and unlocks for retry after failure", () => {
    const gate = createAuthenticationOperationGate()
    let requestCount = 0

    const first = gate.begin("citizen-login")
    if (first) requestCount += 1
    const duplicate = gate.begin("citizen-login")
    if (duplicate) requestCount += 1

    expect(first).not.toBeNull()
    expect(duplicate).toBeNull()
    expect(requestCount).toBe(1)

    expect(gate.finish(first!)).toBe(true)
    const retry = gate.begin("citizen-login")
    if (retry) requestCount += 1

    expect(retry).not.toBeNull()
    expect(requestCount).toBe(2)
  })

  it("commits only one successful navigation and rejects later authentication operations", () => {
    const gate = createAuthenticationOperationGate()
    const operation = gate.begin("citizen-register")
    let navigationCount = 0

    if (operation && gate.commitNavigation(operation)) navigationCount += 1
    if (operation && gate.commitNavigation(operation)) navigationCount += 1

    expect(navigationCount).toBe(1)
    expect(gate.finish(operation!)).toBe(true)
    expect(gate.canSwitchMode()).toBe(false)
    expect(gate.begin("citizen-login")).toBeNull()
  })

  it("aborts and invalidates an in-flight operation when its owner unmounts", () => {
    const gate = createAuthenticationOperationGate()
    const operation = gate.begin("citizen-login")

    expect(operation?.signal.aborted).toBe(false)
    gate.dispose()

    expect(operation?.signal.aborted).toBe(true)
    expect(gate.isCurrent(operation!)).toBe(false)
    expect(gate.commitNavigation(operation!)).toBe(false)
    expect(gate.finish(operation!)).toBe(false)
  })
})
