# Business workflow

## End-to-end municipal report lifecycle

1. **Citizen authentication.** A Citizen registers or signs in through the municipal Better Auth façade. The database session and current live `User.role` are authoritative.
2. **Location confirmation.** The Citizen selects a point through the map flow. Nominatim address fields are resolved only to a configured canonical Jeddah district. Coordinates and district are committed to the form together; the profile district is not used as a physical-location fallback.
3. **Optional Gemini assistance.** The Citizen may send the description, confirmed location, optional validated image, and a bounded set of public duplicate candidates to the server-only assistance route. Gemini suggests a category, severity, reasoning, and possible duplicates. If configuration or provider output is unavailable, the UI continues in manual mode.
4. **Citizen confirmation and submission.** The Citizen accepts or overrides advisory values and submits through the existing `POST /api/reports` path. The server derives ownership from the authenticated stable `User.id` and atomically creates the report and its initial `pending` status-history row.
5. **Community and ownership views.** Citizens can see community-safe report DTOs, vote once per report, and track their own report history. Server authorization protects report details and ownership.
6. **Manager review.** A Manager uses the live PostgreSQL dashboard, filters, charts, map, and table to review reports.
7. **Work-order creation and assignment.** The Manager selects an unresolved report, sets a title, instructions, and priority, and assigns one or more active Crew users. The work order begins as `pending`. A `pending` report moves to `in-progress`, with both histories and an audit log recorded.
8. **Field execution.** An assigned Crew user starts the work order (`active`), records a note, and may upload JPEG, PNG, or WebP completion evidence to Cloudinary. The attachment stores the same report/work-order identity enforced by the database relationship.
9. **Crew completion.** The Crew user moves the active work order to `completed`. The server records `completedAt`, status history, and an audit log.
10. **Manager closure approval.** A Manager reviews the work-order result and evidence. A completed work order is required before the Manager can change the report to `resolved`; the closure creates report status history and an audit log.
11. **ECM eligibility.** A report is archive-eligible when it is `resolved` and has no `ArchiveRecord`.
12. **Manager archiving.** The ECM service loads the report snapshot, histories, votes, attachments, work orders, assignments, and evidence. It creates canonical JSON, calculates SHA-256, uploads a raw JSON document to Cloudinary, reads it back for checksum verification, then atomically stores the `ArchiveRecord` and initial `ARCHIVED` audit event in PostgreSQL.
13. **ECM lifecycle.** Managers search and retrieve archive records, open stored packages, and run **Verify integrity**. Opening and verification append `VIEWED`, `INTEGRITY_VERIFIED`, or `INTEGRITY_FAILED` events. The retention date is five years from archival; automatic disposition is outside this MVP.

## Decision and failure behavior

- Gemini is optional. `available: false` never blocks manual location, classification, or report submission, and no fake suggestion is generated.
- An unmapped or ambiguous Nominatim district keeps the location selector open and requires another selection; the Citizen profile district is never substituted.
- An AI-assistance request does not create a report. Only the confirmed report submission does.
- Report votes are unique by report and user; suggestion votes are unique by suggestion and user.
- Crew operations require a live `Crew` role and an assignment for the specific work order.
- Only a live `Manager` can create work orders, approve closure, or operate ECM endpoints.
- Archive creation is idempotent per report. A report can have at most one archive record.
- If Cloudinary archive upload verification fails, no archive metadata is committed. If the later database transaction fails, the newly uploaded raw object is removed.

## Implemented states

| Record | States |
| --- | --- |
| Report | `pending` → `in-progress` → `resolved` |
| Work order | `pending` → `active` → `completed` |
| Suggestion | `Under Review`, `Approved`, `Rejected` |
| Archive | `archived` |

The diagrams in [diagrams.md](diagrams.md) show the same workflow from use-case, activity, sequence, state, class, and entity-relationship perspectives.
