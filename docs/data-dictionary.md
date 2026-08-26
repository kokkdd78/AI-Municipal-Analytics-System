# Data dictionary

This concise dictionary reflects the important fields in the current Prisma schema. `PK` means primary key, `FK` means foreign key, and `UQ` means unique.

## Identity and authentication

### User

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String, PK | Stable application and ownership identity. |
| `name` | String | Display name; required and nonblank. |
| `authEmail` | String, UQ | Internal Better Auth email-compatible identifier. |
| `emailVerified` | Boolean | Better Auth verification flag; defaults to false. |
| `authUsername` | String?, UQ | Optional internal credential username. |
| `authDisplayUsername` | String? | Optional Better Auth display username. |
| `phone` | String?, UQ | Normalized Citizen phone when present. |
| `employeeId` | String?, UQ | Normalized Manager/Crew employee identifier when present. |
| `passwordHash` | String? | Foundation/legacy optional field; current credential hashes are in `AuthAccount.password`. |
| `role` | UserRole | `Citizen`, `Manager`, or `Crew`. |
| `isActive` | Boolean | Live authorization eligibility; defaults to true. |
| `avatarUrl` | String? | Optional profile image URL. |
| `districtId` | String?, FK | Optional profile District; not report-location authority. |
| `departmentId` | String?, FK | Optional municipal Department. |
| `createdAt`, `updatedAt` | DateTime | Creation and last-update timestamps. |

### Better Auth records

| Entity | Important fields | Meaning |
| --- | --- | --- |
| `AuthSession` | `id`, unique `token`, `userId`, `expiresAt`, `ipAddress?`, `userAgent?`, timestamps | Database-backed session owned by one User. |
| `AuthAccount` | `id`, `providerId`, `accountId`, `userId`, `password?`, token fields, timestamps | Provider/credential account; `(providerId, accountId)` is unique. Credential password is a hash. |
| `AuthVerification` | `id`, `identifier`, `value`, `expiresAt`, timestamps | Expiring Better Auth verification record. |
| `AuthRateLimit` | `id`, unique `key`, `count`, `lastRequest` | Shared database rate-limit bucket. |

## Reference data

| Entity | Important fields | Meaning |
| --- | --- | --- |
| `Department` | `id` (PK), unique `name`, `description?`, timestamps | Municipal responsibility grouping. |
| `District` | `id` (PK), unique `name`, `arabicName`, timestamps | Canonical configured Jeddah district referenced by reports, suggestions, and optional profiles. |

## Reports and suggestions

### Report

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String, PK | Stable report identifier returned after database creation. |
| `authorId` | String?, FK | Authenticated Citizen owner; set by the server. |
| `departmentId` | String?, FK | Optional responsible department. |
| `districtId` | String, FK | Confirmed canonical physical district. |
| `title` | String | Nonblank title derived from the accepted category. |
| `description` | String | Citizen-confirmed report description. |
| `category` | String | Indexed category text. Current report API accepts configured report categories. |
| `status` | ReportStatus | `pending`, `in-progress`, or `resolved`. |
| `severity` | ReportSeverity? | Optional `low`, `medium`, or `high`. |
| `latitude`, `longitude` | Float | Confirmed physical coordinates; database range checked. |
| `importedVoteBaseline` | Int | Nonnegative legacy/import vote count retained separately from Vote rows. |
| `createdAt`, `updatedAt` | DateTime | Lifecycle timestamps. |

### Attachment and Vote

| Entity/field | Meaning |
| --- | --- |
| `Attachment.id` | Attachment PK. |
| `reportId` | Required owning Report FK. |
| `workOrderId`, `workOrderReportId` | Optional composite WorkOrder identity; must identify a WorkOrder for the same Report. |
| `uploadedById` | Optional uploader User FK. |
| `name`, `mimeType`, `url` | Nonblank object metadata and stored URL. |
| `kind` | `report-photo`, `completion-evidence`, or `avatar`. |
| `createdAt` | Upload metadata timestamp. |
| `Vote.id` | Report-vote PK. |
| `Vote.reportId`, `Vote.userId` | Unique pair enforcing one vote per User and Report. |
| `Vote.createdAt` | Vote timestamp. |

### Suggestion and SuggestionVote

| Field | Meaning |
| --- | --- |
| `Suggestion.id` | Suggestion PK. |
| `authorId` | Optional author User FK. |
| `districtId` | Required canonical District FK. |
| `title`, `description`, `category` | Nonblank suggestion content and indexed category text. |
| `status` | `Under Review`, `Approved`, or `Rejected`. |
| `latitude`, `longitude` | Range-checked suggestion coordinates. |
| `importedVoteBaseline` | Nonnegative imported vote count. |
| `createdAt`, `updatedAt` | Lifecycle timestamps. |
| `SuggestionVote.suggestionId`, `userId` | Unique pair enforcing one vote per User and Suggestion. |

## Work orders and histories

| Entity | Important fields | Meaning |
| --- | --- | --- |
| `WorkOrder` | `id`, `reportId`, `departmentId?`, `createdById?`, `title`, `description`, `priority`, `status`, `locationText?`, `startedAt?`, `completedAt?`, timestamps | Operational task for one Report. `(id, reportId)` is unique for attachment consistency. |
| `CrewAssignment` | `id`, `workOrderId`, `crewUserId`, `assignedById?`, `assignedAt` | Assignment join; one row per Crew user and WorkOrder. |
| `StatusHistory` | `id`, `reportId`, `actorId?`, `fromStatus?`, `toStatus`, `note?`, `createdAt` | Ordered Report transition evidence. |
| `WorkOrderStatusHistory` | `id`, `workOrderId`, `actorId?`, `fromStatus?`, `toStatus`, `note?`, `createdAt` | Ordered WorkOrder transition evidence. |
| `AuditLog` | `id`, `actorId?`, `action`, `entityType`, `entityId`, `metadata?`, `createdAt` | General operational audit event. |

`WorkOrder.priority` is `Low`, `Medium`, or `High`; `WorkOrder.status` is `pending`, `active`, or `completed`.

## ECM archive

### ArchiveRecord

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String, PK | Stable archive row ID. |
| `ecmRecordNumber` | String, UQ | Human-readable ECM reference. |
| `reportId` | String, UQ, FK | Exactly one archive per Report. |
| `reportTitle`, `districtName` | String | Searchable archive-time metadata snapshots. |
| `manifest` | JSON | Canonical report/evidence snapshot stored with the archive metadata. |
| `storageKey` | String, UQ | Cloudinary raw-object public ID. |
| `documentUrl` | String | HTTPS Cloudinary URL for the JSON package. |
| `checksum` | String | Lowercase 64-character SHA-256 of canonical JSON bytes. |
| `provider` | String | Current object-storage provider, `cloudinary`. |
| `status` | ArchiveStatus | `archived`. |
| `archivedAt` | DateTime | Snapshot/archive time. |
| `retentionUntil` | DateTime | Five-year retention deadline; must be after `archivedAt`. |
| `archivedById` | String, FK | Manager who created the archive. |
| `createdAt` | DateTime | Database row creation time. |

### ArchiveAuditEvent

| Field | Meaning |
| --- | --- |
| `id` | Event PK. |
| `archiveRecordId` | Parent ArchiveRecord FK. |
| `actorId` | Optional acting User FK. |
| `type` | `archived`, `viewed`, `integrity-verified`, or `integrity-failed`. |
| `details` | Optional JSON event details. |
| `createdAt` | Event timestamp. |
