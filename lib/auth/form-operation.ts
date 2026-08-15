export type CitizenAuthenticationOperation = "citizen-login" | "citizen-register"

export interface AuthenticationOperationToken {
  readonly id: number
  readonly operation: CitizenAuthenticationOperation
  readonly signal: AbortSignal
}

export interface AuthenticationOperationGate {
  begin: (operation: CitizenAuthenticationOperation) => AuthenticationOperationToken | null
  canSwitchMode: () => boolean
  commitNavigation: (token: AuthenticationOperationToken) => boolean
  dispose: () => void
  finish: (token: AuthenticationOperationToken) => boolean
  isCurrent: (token: AuthenticationOperationToken) => boolean
}

export function createAuthenticationOperationGate(): AuthenticationOperationGate {
  let current: { token: AuthenticationOperationToken; controller: AbortController } | null = null
  let navigationCommitted = false
  let nextId = 1

  const isCurrent = (token: AuthenticationOperationToken) =>
    current?.token.id === token.id && current.token.operation === token.operation

  return {
    begin(operation) {
      if (current || navigationCommitted) return null

      const controller = new AbortController()
      const token: AuthenticationOperationToken = Object.freeze({
        id: nextId++,
        operation,
        signal: controller.signal,
      })
      current = { token, controller }
      return token
    },
    canSwitchMode() {
      return current === null && !navigationCommitted
    },
    commitNavigation(token) {
      if (!isCurrent(token) || navigationCommitted) return false
      navigationCommitted = true
      return true
    },
    dispose() {
      current?.controller.abort()
      current = null
    },
    finish(token) {
      if (!isCurrent(token)) return false
      current = null
      return true
    },
    isCurrent,
  }
}
