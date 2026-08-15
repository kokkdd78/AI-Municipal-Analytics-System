# Municipal authentication facade

Phase 2B2A exposes one public authentication facade at `/api/auth/municipal`.
The pathname never selects a credential namespace or role.

## Requests

- `GET /api/auth/municipal` returns the sanitized current-session DTO or a
  generic authentication-required response.
- `POST /api/auth/municipal` requires an exact trusted Origin and one strict
  JSON body selected by its `operation` field. Its media type must be
  `application/json`, optionally with a single case-insensitive
  `charset=utf-8` parameter:
  - `citizen-register`: `name`, `phone`, `districtId`, `password`, and
    `confirmPassword`.
  - `citizen-login`: `phone` and `password`.
  - `staff-login`: `employeeId` and `password`.
  - `sign-out`: no additional fields.

Unknown operations and additional fields are rejected. Query parameters,
headers, callback values, role values, usernames, and internal email addresses
cannot select or override an operation.

The former municipal credential paths and Better Auth's raw sign-up, sign-in,
session, and sign-out paths are not public endpoints. Validated operations are
forwarded internally to the pinned Better Auth handlers so their database rate
limits, proxy handling, credential verification, session storage, and cookie
security remain authoritative.

## Post-authentication compensation

After Better Auth creates a session, the facade reloads the live user and builds
the safe response DTO. If any of those steps fails, the facade signs out using
only the newly issued signed session cookie, verifies that the new session is
gone, and returns only Better Auth's expiration cookies with a generic error. If
that supported cleanup cannot confirm deletion, an exact-token database delete
is attempted; no user-wide session deletion is used.

## Phase 2B2B client transition

The browser calls only the municipal facade with same-origin credentials. POST
requests always use `application/json`; client code accepts only the sanitized
user and role-specific destination returned by the facade. The session cookie
and a freshly loaded database session are the authentication authority.

The municipal browser envelope remains under `smartMunicipalAssistant`, now at
version 2. Citizen profiles are keyed by the exact database user ID. A live
Citizen session may select or create only its matching profile; staff and
anonymous sessions clear that non-authoritative selection without deleting any
profiles, reports, suggestions, votes, attachments, or ownership. The retained
`role` field is a deprecated display compatibility projection and is never read
for authorization.
