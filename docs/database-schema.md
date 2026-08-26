# Database schema

## Overview

The application uses PostgreSQL on Neon through Prisma 7. The current schema is defined in `prisma/schema.prisma`; this document summarizes that file and its checked-in migrations without adding conceptual fields.

The server-only Prisma singleton uses the pooled `DATABASE_URL` with `@prisma/adapter-neon`. Prisma CLI migration and seed configuration uses `DIRECT_URL`. Guarded integration tests use `TEST_DATABASE_URL` through a separate Prisma configuration.

## Enumerations

| Prisma enum | Stored/application values |
| --- | --- |
| `UserRole` | `Citizen`, `Manager`, `Crew` |
| `ReportStatus` | `pending`, `in-progress`, `resolved` |
| `ReportSeverity` | `low`, `medium`, `high` |
| `AttachmentKind` | `report-photo`, `completion-evidence`, `avatar` |
| `SuggestionStatus` | `Under Review`, `Approved`, `Rejected` |
| `WorkOrderStatus` | `pending`, `active`, `completed` |
| `WorkOrderPriority` | `Low`, `Medium`, `High` |
| `ArchiveStatus` | `archived` |
| `ArchiveAuditEventType` | `archived`, `viewed`, `integrity-verified`, `integrity-failed` |

Prisma enum member names such as `IN_PROGRESS` are mapped to the exact stored values above.

## Authentication and user entities

### `User` (`users`)

The stable identity record for all three roles. `phone` is unique when present for Citizens; `employeeId` is unique when present for staff. `authEmail` is an internal unique Better Auth identifier, while `authUsername` is an optional unique credential username. The record can optionally reference one `District` and one `Department`. `isActive` is reloaded with the live role for authorization.

The optional `passwordHash` field remains in the foundation model, but current Better Auth credential hashes belong to `AuthAccount.password`; plaintext passwords are not stored.

### Better Auth models

- `AuthSession` (`auth_sessions`) belongs to one `User`; its token is unique and sessions cascade when the user is removed.
- `AuthAccount` (`auth_accounts`) belongs to one `User`; `(providerId, accountId)` is unique and credential passwords are stored here as hashes.
- `AuthVerification` (`auth_verifications`) stores expiring Better Auth verification records.
- `AuthRateLimit` (`auth_rate_limits`) stores shared database counters keyed by a unique nonblank key.

## Reference entities

### `Department` (`departments`)

A unique department name and optional description. Departments can be referenced by Users, Reports, and WorkOrders. Deleting a department sets those optional references to null.

### `District` (`districts`)

A stable manually assigned ID, unique canonical English name, and Arabic name. Reports and Suggestions require a District, so those foreign keys use restrictive deletion. User district references are optional and use `SET NULL`.

## Citizen reporting and participation

### `Report` (`reports`)

Stores optional Citizen ownership and department routing, a required District, title, description, indexed text category, status, optional severity, latitude/longitude, an imported vote baseline, and timestamps.

Relations:

- optional author `User` (`SET NULL` on user deletion);
- optional `Department` (`SET NULL`);
- required `District` (`RESTRICT`);
- many Attachments, Votes, WorkOrders, and StatusHistory rows;
- zero or one ArchiveRecord.

### `Attachment` (`attachments`)

Stores metadata and a URL for a report photo, completion evidence, or avatar. Every row references a Report. A row may also reference a WorkOrder and uploader. The composite WorkOrder relationship uses both `workOrderId` and `workOrderReportId`, enforcing that work-order evidence belongs to the same report. A check rejects a non-null work order without its report identity.

### `Vote` (`report_votes`)

Joins one User to one Report. `(reportId, userId)` is unique, enforcing one persisted vote per user/report. Imported totals remain in `Report.importedVoteBaseline` and are nonnegative.

### `Suggestion` and `SuggestionVote`

A Suggestion has optional User ownership, a required District, title, description, indexed text category, status, coordinates, imported vote baseline, and timestamps. `(suggestionId, userId)` is unique in `SuggestionVote`.

## Operational workflow

### `WorkOrder` (`work_orders`)

Every WorkOrder belongs to one Report. It may reference a Department and creating User, and stores title, instructions, priority, status, optional location text, lifecycle dates, and timestamps. The composite uniqueness of `(id, reportId)` supports the Attachment consistency foreign key.

### `CrewAssignment` (`crew_assignments`)

Joins one WorkOrder to a Crew User and optionally records the assigning Manager. `(workOrderId, crewUserId)` is unique. Work-order deletion cascades; deleting the assigned Crew user is restricted; deleting the assigning Manager sets `assignedById` to null.

### History and general audit models

- `StatusHistory` records Report transitions, optional actor, note, and timestamp.
- `WorkOrderStatusHistory` records WorkOrder transitions, optional actor, note, and timestamp.
- `AuditLog` stores an action, entity type/ID, optional JSON metadata, optional actor, and timestamp for operational events.

Parent deletion cascades to its status history. Actor deletion preserves history by setting the actor reference to null.

## ECM entities

### `ArchiveRecord` (`archive_records`)

One ArchiveRecord is allowed per Report. It stores a unique ECM record number, report/district search snapshots, immutable manifest JSON at application level, unique Cloudinary storage key, secure document URL, SHA-256 checksum, provider, archive status/time, retention date, archiving Manager, and creation time.

Both the Report and archiving User use restrictive deletion so provenance cannot be severed. The database checks HTTPS document URLs, lowercase 64-character SHA-256 values, nonblank identifiers, and a retention date later than the archive date.

### `ArchiveAuditEvent` (`archive_audit_events`)

Append-only application events linked to one ArchiveRecord, with an optional actor, exact archive event enum, optional JSON details, and timestamp. Archive deletion would cascade to its events, but the application exposes no archive delete operation.

## Important integrity constraints

- Required names, titles, descriptions, categories, attachment metadata, and audit identifiers have nonblank SQL checks.
- Report/Suggestion latitude is constrained to `-90..90`; longitude to `-180..180`.
- Imported vote baselines and authentication rate counters/timestamps are nonnegative.
- Unique keys prevent duplicate phone numbers, employee IDs, internal auth identifiers, Better Auth provider accounts, session tokens, votes, Crew assignments, report archives, ECM numbers, and archive storage keys.
- Required reference-data links use restrictive deletion where losing the link would make a municipal record invalid.
- Child records such as votes and histories generally cascade with their parent; optional human actor/department links generally use `SET NULL` to preserve the municipal record.
- Frequently filtered fields are indexed, including report status/category/district/date, suggestion status/category/district/date, work-order status/priority/date, archive dates/status/search snapshots, and history/audit timelines.

See [data-dictionary.md](data-dictionary.md) for field-level definitions and [diagrams.md](diagrams.md) for the domain class diagram and ERD.
