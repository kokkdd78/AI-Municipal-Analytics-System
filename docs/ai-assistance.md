# Gemini report assistance

## Purpose

Gemini assistance is an optional advisory step in Citizen report preparation. It helps classify a draft and identify possible duplicates, but the Citizen remains responsible for confirming the location, reviewing every suggestion, and submitting the report.

The feature does not create, assign, close, or archive records and does not alter Manager, Crew, or ECM authority.

## Server-side flow

1. An authenticated `Citizen` submits a strict JSON request to `POST /api/reports/assist` from a trusted origin.
2. Zod validates the description, canonical `districtId`, confirmed latitude/longitude, optional location text, and optional image.
3. The server retrieves up to 20 recent report candidates in the same district from PostgreSQL. The repository uses a bounded 90-day window and selects only data needed for comparison.
4. If both `GEMINI_API_KEY` and `GEMINI_MODEL` are configured, the server-only provider calls the Google Gen AI SDK.
5. Gemini is asked for structured JSON containing an allowed category, an allowed severity, short reasoning, and zero to five IDs chosen only from the supplied candidates.
6. Zod validates the provider response. Duplicate IDs not present in the bounded candidate set are discarded.
7. The API returns either validated advisory content or `{ "available": false }`.

The API key is read only in the server provider module. It is never included in client bundles, request DTOs, responses, or logs.

## Advisory output

A successful response contains:

- `category`: one of `trash`, `lighting`, `pothole`, `water`, `trees`, or `other`.
- `severity`: `low`, `medium`, or `high`.
- `reasoning`: a short neutral explanation.
- `duplicates`: possible duplicate report IDs, titles, and short summaries.

The Quick Photo Report UI can apply these values to the draft. The Citizen can change the category, severity, description, or location before confirming. The final submission still uses the ordinary `POST /api/reports` endpoint and its normal PostgreSQL transaction/status-history behavior.

## Image handling

An assistance image is optional. The current assistance contract accepts only:

- JPEG (`image/jpeg`)
- PNG (`image/png`)
- WebP (`image/webp`)
- at most 1,000,000 decoded bytes

The server validates the data URL, declared type, decoded size, and file signature before sending the image inline to Gemini. This AI-specific limit is separate from the 4 MiB report-image upload limit used by the Cloudinary report attachment route.

## Privacy and data minimization

Gemini may receive only:

- the draft description;
- the confirmed district and coordinates/location text;
- the optional validated draft image; and
- bounded candidate metadata: ID, title, category, a shortened description, district name, and coordinates.

The provider is not sent Citizen identity, credentials, session data, phone numbers, votes, work orders, unrelated attachments, Manager/Crew records, or ECM records.

## Validation and fallback

The manual form remains authoritative and usable when:

- `GEMINI_API_KEY` is absent;
- `GEMINI_MODEL` is absent;
- the provider is unavailable or times out;
- the provider returns malformed JSON or unsupported enum values; or
- output fails Zod validation.

In those cases the service returns exactly an unavailable result and does not invent classifications or duplicates. Invalid request input, including an oversized or unsupported image, is rejected as a validation error rather than presented as AI output.

## Known limitations

- Duplicate detection is advisory semantic comparison over a bounded same-district candidate set, not a definitive duplicate decision.
- Provider availability, quota, model access, latency, and output quality depend on the configured Gemini account and model.
- The system does not train a municipal model, retain provider conversations, or automatically learn from Manager decisions.
- Automated tests mock the provider; they do not make real Gemini calls.
