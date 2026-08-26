# UML and database diagrams

These Mermaid diagrams are derived from the implemented roles, routes, services, state enums, and Prisma entities. They intentionally omit infrastructure details when those details would make the academic view unreadable.

## 1. Use Case Diagram

```mermaid
flowchart LR
  Citizen([Citizen])
  Manager([Manager])
  Crew([Field Crew])

  subgraph System[Smart Municipal Assistant with ECM]
    UC1((Register / sign in))
    UC2((Confirm report location))
    UC3((Request optional Gemini advice))
    UC4((Submit and track report))
    UC5((View map and vote))
    UC6((Submit and vote on suggestions))
    UC7((View dashboard and filters))
    UC8((Create and assign work order))
    UC9((Update assigned work))
    UC10((Upload completion evidence))
    UC11((Approve report closure))
    UC12((Archive resolved report))
    UC13((Search, retrieve, and verify archive))
  end

  Citizen --> UC1
  Citizen --> UC2
  Citizen --> UC3
  Citizen --> UC4
  Citizen --> UC5
  Citizen --> UC6
  Manager --> UC1
  Manager --> UC7
  Manager --> UC8
  Manager --> UC11
  Manager --> UC12
  Manager --> UC13
  Crew --> UC1
  Crew --> UC9
  Crew --> UC10
```

## 2. Activity Diagram — full report lifecycle

```mermaid
flowchart TD
  A[Citizen signs in] --> B[Select point on Leaflet map]
  B --> C[Nominatim reverse geocoding]
  C --> D{Unique configured district?}
  D -- No --> B
  D -- Yes --> E[Store coordinates and canonical district atomically]
  E --> F{Request Gemini assistance?}
  F -- Yes --> G[Validate draft and optional image]
  G --> H{Provider result valid?}
  H -- Yes --> I[Show advisory category, severity, reasoning, duplicates]
  H -- No --> J[Continue with manual fields]
  F -- No --> J
  I --> K[Citizen accepts or overrides suggestions]
  J --> K
  K --> L[POST report]
  L --> M[Transaction: Report plus initial pending history]
  M --> N[Manager reviews dashboard]
  N --> O[Create and assign pending work order]
  O --> P[Report becomes in-progress]
  P --> Q[Crew starts work order]
  Q --> R[Crew uploads evidence and completes work]
  R --> S[Manager reviews completion]
  S --> T{Approve closure?}
  T -- No --> S
  T -- Yes --> U[Report becomes resolved]
  U --> V[Report is ECM eligible]
  V --> W[Manager archives canonical JSON package]
  W --> X[Archive metadata and archived event persisted]
  X --> Y[Search, retrieve, and verify integrity]
  Y --> Z[Append viewed or integrity audit event]
```

## 3. Sequence Diagram — report submission and AI assistance

```mermaid
sequenceDiagram
  actor C as Citizen
  participant UI as Citizen report UI
  participant MAP as Leaflet / Nominatim
  participant A as Assistance API
  participant G as Gemini
  participant R as Reports API
  participant DB as Neon PostgreSQL

  C->>UI: Enter description and choose point
  UI->>MAP: Reverse-geocode coordinates
  MAP-->>UI: Address fields
  UI->>UI: Resolve canonical configured district
  opt Citizen requests AI advice
    UI->>A: Validated draft, confirmed location, optional image
    A->>DB: Read bounded recent same-district candidates
    alt Gemini configured and valid
      A->>G: Minimal draft and candidate metadata
      G-->>A: Structured advisory JSON
      A->>A: Zod validation and candidate-ID allowlist
      A-->>UI: Category, severity, reasoning, duplicates
    else Unavailable or malformed
      A-->>UI: available false
    end
  end
  C->>UI: Confirm or override fields
  UI->>R: POST report through existing API
  R->>DB: Transaction creates Report and pending StatusHistory
  DB-->>R: Stable database report ID
  R-->>UI: Safe report DTO
  UI-->>C: Success and tracking navigation using database ID
```

## 4. Sequence Diagram — work order, closure, and ECM

```mermaid
sequenceDiagram
  actor M as Manager
  actor C as Field Crew
  participant D as Manager dashboard API
  participant W as Crew work-order API
  participant DB as Neon PostgreSQL
  participant CL as Cloudinary
  participant E as ECM service

  M->>D: Create work order and assign Crew
  D->>DB: Transaction creates order, assignment, histories, audit
  DB-->>D: pending work order; report in-progress
  C->>W: Start assigned work
  W->>DB: active status, startedAt, history, audit
  C->>W: Upload completion evidence
  W->>CL: Store validated evidence image
  W->>DB: Create same-report WorkOrder Attachment
  C->>W: Complete assigned work
  W->>DB: completed status, completedAt, history, audit
  M->>D: Approve report closure
  D->>DB: Validate completed order; set report resolved
  M->>E: Archive resolved report
  E->>DB: Read report snapshot and related evidence
  E->>E: Canonical JSON and SHA-256
  E->>CL: Upload raw JSON and read it back
  E->>E: Verify stored checksum
  E->>DB: Create ArchiveRecord and ARCHIVED event atomically
  M->>E: Verify integrity
  E->>CL: Read retained JSON bytes
  E->>DB: Append INTEGRITY_VERIFIED or INTEGRITY_FAILED event
```

## 5. Class / Domain Diagram

```mermaid
classDiagram
  class User {
    +String id
    +String name
    +UserRole role
    +Boolean isActive
    +String phone
    +String employeeId
  }
  class District {
    +String id
    +String name
    +String arabicName
  }
  class Department {
    +String id
    +String name
  }
  class Report {
    +String id
    +String title
    +String description
    +String category
    +ReportStatus status
    +ReportSeverity severity
    +Float latitude
    +Float longitude
  }
  class Attachment {
    +String id
    +AttachmentKind kind
    +String url
  }
  class Vote {
    +String id
    +DateTime createdAt
  }
  class Suggestion {
    +String id
    +String title
    +SuggestionStatus status
  }
  class SuggestionVote {
    +String id
  }
  class WorkOrder {
    +String id
    +WorkOrderPriority priority
    +WorkOrderStatus status
    +DateTime startedAt
    +DateTime completedAt
  }
  class CrewAssignment {
    +String id
    +DateTime assignedAt
  }
  class StatusHistory {
    +ReportStatus fromStatus
    +ReportStatus toStatus
    +String note
  }
  class WorkOrderStatusHistory {
    +WorkOrderStatus fromStatus
    +WorkOrderStatus toStatus
    +String note
  }
  class AuditLog {
    +String action
    +String entityType
    +String entityId
  }
  class ArchiveRecord {
    +String ecmRecordNumber
    +Json manifest
    +String checksum
    +DateTime archivedAt
    +DateTime retentionUntil
  }
  class ArchiveAuditEvent {
    +ArchiveAuditEventType type
    +DateTime createdAt
  }

  District "1" --> "0..*" Report
  Department "0..1" --> "0..*" Report
  User "0..1" --> "0..*" Report : authors
  Report "1" *-- "0..*" Attachment
  Report "1" *-- "0..*" Vote
  User "1" --> "0..*" Vote
  District "1" --> "0..*" Suggestion
  Suggestion "1" *-- "0..*" SuggestionVote
  User "1" --> "0..*" SuggestionVote
  Report "1" *-- "0..*" WorkOrder
  WorkOrder "1" *-- "0..*" CrewAssignment
  User "1" --> "0..*" CrewAssignment : assigned crew
  Report "1" *-- "0..*" StatusHistory
  WorkOrder "1" *-- "0..*" WorkOrderStatusHistory
  User "0..1" --> "0..*" AuditLog : actor
  Report "1" --> "0..1" ArchiveRecord
  User "1" --> "0..*" ArchiveRecord : archives
  ArchiveRecord "1" *-- "0..*" ArchiveAuditEvent
```

## 6. Report State Diagram

```mermaid
stateDiagram-v2
  state "pending" as pending
  state "in-progress" as in_progress
  state "resolved" as resolved
  [*] --> pending: Citizen submits report
  pending --> in_progress: Manager creates work order
  in_progress --> resolved: Manager approves completed work
  note right of resolved
    A Manager may create a separate ArchiveRecord.
    The Report itself remains resolved.
  end note
```

`archived` is the `ArchiveRecord.status`; it is not an additional `Report.status`. The Report remains `resolved` after archival.

## 7. Database ERD

```mermaid
erDiagram
  DISTRICT ||--o{ USER : profile_district
  DEPARTMENT ||--o{ USER : employs
  USER ||--o{ AUTH_SESSION : owns
  USER ||--o{ AUTH_ACCOUNT : owns
  USER o|--o{ REPORT : authors
  DEPARTMENT o|--o{ REPORT : handles
  DISTRICT ||--o{ REPORT : locates
  REPORT ||--o{ ATTACHMENT : contains
  USER o|--o{ ATTACHMENT : uploads
  REPORT ||--o{ REPORT_VOTE : receives
  USER ||--o{ REPORT_VOTE : casts
  USER o|--o{ SUGGESTION : authors
  DISTRICT ||--o{ SUGGESTION : locates
  SUGGESTION ||--o{ SUGGESTION_VOTE : receives
  USER ||--o{ SUGGESTION_VOTE : casts
  REPORT ||--o{ WORK_ORDER : has
  DEPARTMENT o|--o{ WORK_ORDER : handles
  USER o|--o{ WORK_ORDER : creates
  WORK_ORDER ||--o{ CREW_ASSIGNMENT : has
  USER ||--o{ CREW_ASSIGNMENT : crew_member
  USER o|--o{ CREW_ASSIGNMENT : assigned_by
  WORK_ORDER o|--o{ ATTACHMENT : evidence_for
  REPORT ||--o{ REPORT_STATUS_HISTORY : records
  WORK_ORDER ||--o{ WORK_ORDER_STATUS_HISTORY : records
  USER o|--o{ REPORT_STATUS_HISTORY : acts
  USER o|--o{ WORK_ORDER_STATUS_HISTORY : acts
  USER o|--o{ AUDIT_LOG : acts
  REPORT ||--o| ARCHIVE_RECORD : archived_as
  USER ||--o{ ARCHIVE_RECORD : archived_by
  ARCHIVE_RECORD ||--o{ ARCHIVE_AUDIT_EVENT : records
  USER o|--o{ ARCHIVE_AUDIT_EVENT : acts

  USER {
    string id PK
    string role
    boolean isActive
    string districtId FK
    string departmentId FK
  }
  AUTH_SESSION {
    string id PK
    string token UK
    string userId FK
    datetime expiresAt
  }
  AUTH_ACCOUNT {
    string id PK
    string userId FK
    string providerId
    string accountId
  }
  AUTH_VERIFICATION {
    string id PK
    string identifier
    datetime expiresAt
  }
  AUTH_RATE_LIMIT {
    string id PK
    string key UK
    int count
  }
  DISTRICT {
    string id PK
    string name UK
    string arabicName
  }
  DEPARTMENT {
    string id PK
    string name UK
  }
  REPORT {
    string id PK
    string authorId FK
    string districtId FK
    string status
    string category
  }
  ATTACHMENT {
    string id PK
    string reportId FK
    string workOrderId FK
    string kind
    string url
  }
  REPORT_VOTE {
    string id PK
    string reportId FK
    string userId FK
  }
  SUGGESTION {
    string id PK
    string authorId FK
    string districtId FK
    string status
  }
  SUGGESTION_VOTE {
    string id PK
    string suggestionId FK
    string userId FK
  }
  WORK_ORDER {
    string id PK
    string reportId FK
    string status
    string priority
  }
  CREW_ASSIGNMENT {
    string id PK
    string workOrderId FK
    string crewUserId FK
    string assignedById FK
  }
  REPORT_STATUS_HISTORY {
    string id PK
    string reportId FK
    string actorId FK
    string toStatus
  }
  WORK_ORDER_STATUS_HISTORY {
    string id PK
    string workOrderId FK
    string actorId FK
    string toStatus
  }
  AUDIT_LOG {
    string id PK
    string actorId FK
    string entityType
    string entityId
  }
  ARCHIVE_RECORD {
    string id PK
    string reportId FK,UK
    string ecmRecordNumber UK
    string storageKey UK
  }
  ARCHIVE_AUDIT_EVENT {
    string id PK
    string archiveRecordId FK
    string actorId FK
    string type
  }
```

`AuthVerification` and `AuthRateLimit` are independent Better Auth infrastructure tables and therefore have no application foreign-key line in this ERD.
