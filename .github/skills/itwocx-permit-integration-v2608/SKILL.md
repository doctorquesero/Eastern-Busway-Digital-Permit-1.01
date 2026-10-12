---
name: itwocx-permit-integration-v2608
description: iTwoCX REST API v26.08 protocol for the Can You Dig It permit sync worker (functions/src/index.ts). Use when looking up, issuing, closing or attaching PDFs to permits in iTwoCX, or when debugging empty lookups (Items: []) and UND_ERR_HEADERS_TIMEOUT.
---

# iTwoCX v26.08 permit integration

Base URL: `https://au.itwocx.com/api/26.08`. Every path is `/Api/{projectCode}/...` (project code in the path, never in a query/header). LIVE = `EB` (`permits`), DEMO = `EB-DEMO` (`permits_demo`); never mix them.

Every request sends `Accept: application/json` and the configured `User-Agent`. Session token goes in the `Key` header.

## Authentication
`POST /Api/Login/ByEmail` with `{ "Email", "Password" }` (PascalCase, plain-text password). Never use `EncryptedPassword` or `Login/EncryptPassword`. Response contains `Key`. Never log passwords or tokens. On 401/403/HTML response: log in again and retry once, then dead-letter.

## Lookup (issued / closed permits)
- Reference = `'PF#' + digits-only number padded to 4` (`55` -> `PF#0055`, `11629` -> `PF#11629`).
- Use `GET /Api/{project}/Document/GetByReference?reference=` + `encodeURIComponent(ref)` (`PF%2311629`). It returns the document object directly; read its numeric `Id` (e.g. `21432820`).
- Do NOT use `GetByDocCode`: in 26.08 `DocCode` is the document type (`"PF"`), so `?code=PF%2311629` returns HTTP 200 `{"Items":[],"NextPageLink":null,"Count":0}` with no error (the `Items: []` symptom). Do not use `POST /Document/Search`.
- Fallback: `GET /Api/{project}/Document/GetById/{id}` using the permit's stored `cxDocumentId` (saved after each successful sync).

## Golden Path (closure)
1. Fresh login.
2. `GetByReference` (fallback `GetById`).
3. Deep clone the document (`JSON.parse(JSON.stringify(doc))`).
4. On the clone set only `StatusName = "CLOSED"` and `ActionCodes = ["CLOSE"]`. Issuance: `"PERMIT ISSUED"` / `["ISSUE"]`.
5. Upload the signed PDF (closures only) BEFORE the PUT; a CLOSED document is immutable and rejects attachments.
6. `PUT /Api/{project}/Document/Update` with the full cloned object. Never send a minimal payload. Treat `IsSuccess === false` as failure and surface `ErrorMessages`.

Only the Breaking Ground family (BG, BGP, BE, EXCAVATION) syncs closures to CX.

## Attachment upload
`POST /Api/{project}/Attachment/Upload?documentId={Id}` body `{ Name, ChunkId: 1, ChunkTotal: 1, Content: <base64 pdf> }`.

Large uploads must use an explicit undici dispatcher, because native `fetch` ignores per-call timeouts:

```ts
import { Agent, fetch as undiciFetch } from 'undici';
const uploadDispatcher = new Agent({ headersTimeout: 110000, bodyTimeout: 110000 });
await undiciFetch(url, { ...options, dispatcher: uploadDispatcher });
```
110s stays below the function limit. Triggers `onPermitWritten` / `onDemoPermitWritten` use `memory: '1GiB'`, `timeoutSeconds: 120`.

## Symptoms and causes
| Symptom | Cause / fix |
|---|---|
| `GetByDocCode` returns `Items: []` with HTTP 200 | DocCode is the type ("PF"). Use `GetByReference`. |
| `UND_ERR_HEADERS_TIMEOUT` on Attachment/Upload | Default undici timeout; use the dispatcher above. |
| HTML / 403 login page | Expired session or missing WAF headers; re-login and retry once. |
| `IsSuccess: false` with HTTP 200 | CX rejected the request; read `ErrorMessages`. |
| Function dies at 256Mi | Set `memory: '1GiB'` in the trigger options. |

Also: the PDF must be uploaded to Firebase Storage (15s timeout, abort on failure) and `pdfBackupUrl` saved before `syncStatus: 'pending'` is set.
