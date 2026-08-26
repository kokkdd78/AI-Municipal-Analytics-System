# External services and APIs

The MVP integrates only the services needed by its implemented academic workflow. It does not connect to an external municipal operational system or a third-party ECM product.

## Google Gemini

**Purpose:** Optional Citizen report assistance for suggested category, severity, short reasoning, and possible duplicate candidates.

**Integration:** The server-only `@google/genai` provider is called through `POST /api/reports/assist` when `GEMINI_API_KEY` and `GEMINI_MODEL` are configured. Provider output is advisory and must pass Zod validation. Provider failure returns `{ "available": false }`; the normal manual report form remains usable.

**Data boundary:** Only the draft description, confirmed location, optional validated assistance image, and bounded public candidate metadata are sent. Authentication, identity, operations, and ECM data are excluded.

## OpenStreetMap, Leaflet, and Nominatim

**Purpose:** Interactive report maps, point selection, and reverse geocoding.

- Leaflet and React Leaflet render map views and report markers in the browser.
- OpenStreetMap supplies map tiles.
- Nominatim reverse-geocodes selected coordinates.
- The centralized resolver inspects `neighbourhood`, `suburb`, `quarter`, `residential`, and `city_district`, then accepts only a unique configured canonical Jeddah district.

Coordinates remain the selected point. A district is never inferred from the Citizen profile, and an unsupported or ambiguous Nominatim result is rejected instead of guessed. The configured Al-Marwah Arabic case has automated coverage, not a claimed manual browser verification.

Nominatim is a geographic lookup service, not an authoritative cadastral boundary service. Deployment must respect the tile and geocoding providers' usage policies and availability limits.

## Cloudinary

**Purpose:** Server-side object storage for:

- Citizen report images;
- Crew completion-evidence images; and
- canonical ECM JSON packages as raw documents.

The application validates supported image types and sizes before upload. Report photos accept JPEG, PNG, or WebP up to 5 MiB. AI inline images have the stricter 1,000,000-byte limit described in [ai-assistance.md](ai-assistance.md). ECM packages are uploaded as raw JSON, read back, and SHA-256 verified before archive metadata is committed.

Cloudinary credentials are server-only. PostgreSQL stores attachment metadata/URLs or archive storage metadata; it does not store the image or raw document bytes.

## Neon PostgreSQL

**Purpose:** Durable relational persistence for authentication, reference data, reports, suggestions, votes, operational workflow, histories, audit logs, and ECM metadata.

The Next.js runtime uses Prisma 7 through the Neon adapter and the pooled `DATABASE_URL`. Prisma CLI migrations use `DIRECT_URL`. Integration tests use a separate `TEST_DATABASE_URL` and a guard that refuses a test target matching either runtime production identity.

Neon is the database host, while Prisma defines and queries the relational model. Cloudinary remains a separate object store; `ArchiveRecord` and `Attachment` rows retain the secure URLs and identifying metadata needed for retrieval.

## Services deliberately not integrated

- No real SMS or OTP provider.
- No external municipal work-order or asset-management API.
- No external ECM suite or vendor adapter layer.
- No PostGIS service.
- No automatic email/SMS notification service.
