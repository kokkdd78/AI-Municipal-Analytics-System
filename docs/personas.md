# Personas

The application has three database roles. Each persona below reflects the actions implemented by the current user interface and server authorization rules.

## Citizen

**Typical context:** A Jeddah resident who notices a road, lighting, sanitation, water, tree, or other local issue.

**Goals**

- Report an issue with an accurate location and enough detail for municipal review.
- See whether the issue is already reported.
- Track progress without contacting multiple departments.
- Participate through report votes and neighborhood suggestions.

**Responsibilities**

- Confirm the physical report location on the map.
- Review and, when appropriate, override optional Gemini suggestions.
- Submit accurate descriptions and supported images.
- Use votes and suggestions responsibly.

**Needs**

- A simple phone/password sign-in and registration flow.
- Clear manual reporting when Gemini is unavailable.
- Privacy: community responses must not disclose another Citizen's identity.
- Reliable ownership based on the stable database user ID.

**Main actions**

- Register, sign in, and sign out.
- Create a normal or Quick Photo Report.
- Request optional category, severity, and duplicate advice.
- Select an atomic canonical district and coordinate pair.
- View, vote on, and map community reports.
- View and track only owned report details/status.
- Create and vote on suggestions.

## Manager

**Typical context:** A municipal operations coordinator responsible for triage, assignment, closure approval, and records oversight.

**Goals**

- Understand workload and issue distribution from current database records.
- Assign appropriate Crew resources and priorities.
- Verify completion before closing a report.
- Preserve resolved reports as retrievable electronic records.

**Responsibilities**

- Review database KPI cards, charts, filters, map points, and report rows.
- Create work orders only for appropriate unresolved reports.
- Assign active Crew users and maintain work-order priority.
- Review field notes and completion evidence.
- Approve closure only after the required work is complete.
- Archive eligible resolved reports and review archive integrity/audit history.

**Needs**

- Live, filterable operational data rather than client-side mock authority.
- Clear work-order state, assignment, evidence, and history.
- Searchable archive metadata with a stable ECM reference.
- Server-side Manager authorization for every privileged action.

**Main actions**

- Sign in with employee credentials.
- Filter dashboard data by date, district, category, and report status.
- Review KPI cards, Recharts charts, report map, and report table.
- Create, assign, reprioritize, and reassign work orders.
- Approve report closure.
- Archive resolved reports, search records, open packages, and verify checksums.

## Field Crew

**Typical context:** A field employee who receives municipal work assignments and records execution evidence.

**Goals**

- See only the work orders assigned to them.
- Understand the issue, location, priority, and current task state.
- Record progress and completion evidence efficiently.

**Responsibilities**

- Start assigned work before completing it.
- Add useful progress or completion notes.
- Upload supported evidence associated with the correct report and work order.
- Mark work complete only after field activity is finished.

**Needs**

- A focused task list with no Manager-only controls.
- Stable assignment-based authorization.
- Clear upload and status feedback.
- A history that preserves who changed a task and when.

**Main actions**

- Sign in with employee credentials.
- View assigned work orders.
- Change an assigned work order from `pending` to `active`, then to `completed`.
- Upload JPEG, PNG, or WebP completion evidence.
- Add status notes and sign out.
