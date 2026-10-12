CAN YOU DIG IT - MASTER CONFIGURATION & KNOWLEDGE BASE
(Source of truth for all integrations, architecture, and developer rules)

1. iTwoCX Integration Architecture (The "CX" Sync)
The connection between Can You Dig It and the iTwoCX platform is strictly bound to the iTwoCX REST API (v26.08). All code written by any AI agent MUST adhere to these exact constraints to avoid silent failures, WAF blocks, or API rejections.

A. Dynamic Routing & Swagger Adherence
  - The iTwoCX API strictly requires the Project Code to be injected into the URL path, NOT passed as a query string or header. The official schema is: `/Api/{projectCode}/Endpoint/Method`.
  - Base URL Constraint: The base constant must be strictly `https://au.itwocx.com/api/26.08`.
  - Passwords: As of v26.08, login payloads must use plain-text `Password` (PascalCase), strictly avoiding the deprecated `EncryptedPassword` field.
  - ALL outbound requests MUST include the configured `User-Agent` and `Accept: application/json` headers.

B. Document Lookup Endpoint (GetByReference - APPROVED STANDARD, v26.08)
  - Find permits with `GET /Api/{projectCode}/Document/GetByReference?reference=${encodeURIComponent('PF#' + paddedNumber)}`. This supersedes the earlier `GetByDocCode` and `POST /Document/Search` standards; do not use either.
  - Why: in 26.08 the `DocCode` field is the document TYPE (`"PF"`), not the permit number. The "REF" shown in the CX UI is the `Reference` field. `GetByDocCode?code=PF%2311629` returns HTTP 200 with `{"Items":[],"NextPageLink":null,"Count":0}` (silent empty result, no error), so it can never find a permit.
  - `GetByReference` returns the document object directly (not a paged list). Use its internal numeric `Id` (e.g. `21432820` for `PF#11629`) for attachments and updates. The worker also tolerates a paged `Items[0]` shape.
  - Fallback: if `GetByReference` finds nothing and the Firestore permit has `cxDocumentId`, call `GET /Api/{projectCode}/Document/GetById/{id}`. The worker saves `cxDocumentId` after every successful sync.
  - Never log passwords or session tokens.

C. Reference Format & URL Encoding
  - The iTwoCX workflow engine is mathematically strict. Permits must be zero-padded to a minimum of 4 digits (`55` -> `0055`, `11629` stays `11629`) and prefixed with the literal string `PF#`.
  - Example Logic: 
    `const cleanNumber = String(permitNumber).replace(/\D/g, "");`
    `const paddedNumber = cleanNumber.padStart(4, "0");`
    `const exactCXReference = 'PF#' + paddedNumber;`
  - The `#` MUST be URL-encoded with `encodeURIComponent()`, so `PF#11629` is sent as `PF%2311629`:
    `GET /Api/{projectCode}/Document/GetByReference?reference=${encodeURIComponent(exactCXReference)}`
  - Sending an unencoded `PF#11629` will fail (`#` starts a URL fragment).

D. Document Update (Golden Path)
  - Sequence: fresh login -> `GetByReference` -> deep clone the returned document -> mutate only `StatusName` and `ActionCodes` on the clone (in memory) -> upload PDF via undici (closures only, before the PUT changes the status) -> `PUT /Api/{projectCode}/Document/Update` with the full cloned object. Never send a minimal payload.
  - Closure: `StatusName = "CLOSED"`, `ActionCodes = ["CLOSE"]`.
  - Issuance: `StatusName = "PERMIT ISSUED"`, `ActionCodes = ["ISSUE"]`.

F. Exact Semantics (Status & Action Codes)
  - To ISSUE a permit: `StatusName = "PERMIT ISSUED"` | `ActionCodes = ["ISSUE"]`
  - To CLOSE a permit: `StatusName = "CLOSED"` | `ActionCodes = ["CLOSE"]`
  - The backend trigger must strictly evaluate `isDraft === false` or `status === 'active'` to trigger Issuance, and ONLY trigger Closure when explicitly marked as `'closed'`.

G. File Attachments (Signed PDFs)
  - PDFs must be uploaded BEFORE the document status is changed to CLOSED. Once a document is CLOSED in CX, it becomes immutable and attachments will be rejected.
  - Endpoint: `POST /Api/{projectCode}/Attachment/Upload?documentId={Id}` (Using the extracted internal `Id`).
  - Binary PDF uploads MUST use an explicit `undici` dispatcher: `new Agent({ headersTimeout: 110000, bodyTimeout: 110000 })` passed as `dispatcher` to `undici.fetch`. Node's native `fetch` ignores per-call timeout options, so large uploads fail with `UND_ERR_HEADERS_TIMEOUT`. 110s stays under the 120s function `timeoutSeconds`. `onPermitWritten`/`onDemoPermitWritten` run with `memory: '1GiB'`, `timeoutSeconds: 120`.

H. v26.08 Login Authentication (Raw Password)
  - Authenticate over HTTPS using `POST /Api/Login/ByEmail` against the configured v26.08 base URL.
  - Send the login DTO with PascalCase `Email` and `Password` fields. `Password` contains the raw password value; never call the removed `Login/EncryptPassword` endpoint or send `EncryptedPassword`.
  - Require a session token in a successful login response before caching it. Never log passwords or session tokens.
  - Send the session token in the `key` header on subsequent iTwoCX requests. Refresh and retry once when the session is rejected.

I. Session Token Auto-Renewal (403 HTML Error Handling)
  - The iTwoCX API returns a 403 HTML login page when the Session Token expires (or if WAF headers are missing). The backend MUST catch any 403/401 or HTML parsing errors, trigger a new `cxLogin()` to fetch a fresh token, and automatically retry the failed request once before sending it to the Dead Letter Queue.

J. LIVE / DEMO Environment Coexistence
  - LIVE is the primary production pipeline: Firestore collection `permits`, iTwoCX project code `EB`, handled by `onPermitWritten`.
  - DEMO coexists with LIVE: Firestore collection `permits_demo`, iTwoCX project code `EB-DEMO`, handled by `onDemoPermitWritten`. The environment toggle (`getAppMode` / `getTargetCollection`) and demo routing are active features. Do NOT remove or strip them.
  - Both pipelines share the same `processPendingPermitSync` worker and the same Rules 1.A-1.I; only the collection and project code differ.
  - Never mix data between environments: queries must stay scoped to the active environment's collection and `env` value.
  - Master-only access and testing credentials are restricted to the exact email `dietrich.truchsess@easternbusway.nz`.


2. Core Architectural Rules (PermitDetail.tsx & UI)

A. Permit Closure Authority Rules
The closure logic follows a strict dual-authority model:
  - Normal Closure (Receiver): If the work is completed or the permit expires without incidents, only the Receiver has the authority to execute the closure.
  - Safety Closure / Strike (Issuer): If a "Cease Works" protocol is triggered (e.g., strike, methodology change, etc.), the permit is locked for the Receiver. Only the Issuer has the authority to execute the emergency closure ("Cancel / Revoke Permit immediately").

B. CX Synchronization Filter (Breaking Ground Family)
  - The synchronization of closures with iTwoCX (via `cxSyncPending: 'closure'`) only applies to the "Breaking Ground" family.
  - Authorized Permit Types: BG, BGP, BE, and EXCAVATION.
  - Other permits close locally in Firebase but do not trigger iTwoCX API calls.

C. Strict PDF Backup Sequence
  - Golden Rule: NEVER set a permit status to `syncStatus: 'pending'` before the PDF backup is finalized.
  - Mandatory Sequence: 1. User confirms closure -> 2. Set status to closed locally -> 3. Generate PDF (html2canvas/jsPDF) -> 4. Upload to Firebase Storage and retrieve `pdfBackupUrl` -> 5. Set `syncStatus: 'pending'` and `cxSyncPending: 'closure'` to trigger the backend worker.
  - Upload Timeout & Abort Sequence: The Firebase Storage upload (`uploadString`) MUST be wrapped in a strict 15-second timeout (e.g., using `Promise.race`). If the upload fails or times out, the system must trigger an ABSOLUTE ABORT SEQUENCE: revert the optimistic UI state, skip Firestore synchronization completely, and display an error.

D. Draft State & Issue Validations
  - Visual State Integrity: The status badge "ISSUED / ACTIVE" must rely strictly on the `isDraft` boolean flag (`const isIssued = permit?.isDraft === false && !isClosed;`). Never rely on the database string `status`, as it defaults to `'active'`.
  - Issuance Locking: To issue a permit, it is mandatory that all 5 Issuer Verification Checks (Radio buttons: Scanned, Marked, Potholing, Transpower, Watercare) be completed. The issuance function must block execution if any are null or undefined.

E. Frontend Data Handling & Safe Undefined Fallbacks
  - Legacy or test permits may lack modern nested objects (like `receiverEmail`, `receiverSignature`, or Note `author`/`timestamp`).
  - All frontend rendering loops (like the Notes section) and `.filter()` arrays MUST use "Safe Undefined Fallbacks" (e.g., safely falling back to empty strings `""` or omitting the block without crashing) to prevent silent runtime crashes, 0-result bugs, or visual regressions.

F. Permit-Level Role Exclusivity
  - A strict business rule dictates that an Issuer CANNOT be assigned as the Receiver on the SAME permit. The UI (Dropdowns/Selectors) and submission logic must mutually exclude the selected user across these two roles.

G. User Management & Master Settings UI
  - Strict Data Collection: New user creation strictly mandates First Name, Last Name, Phone Number, Email Address, and Roles. This MUST be handled via a dedicated React Modal. Native browser `window.prompt` or inline quick-add inputs are strictly PROHIBITED.
  - Role Editing (Settings): Inline editing of user roles MUST utilize a multi-select checkbox group. It must dynamically enforce exclusivity (checking Issuer unchecks Receiver, and vice versa).
  - UI Dropdown Mapping: For all UI dropdowns, the application MUST visually render the user's Full Name but strictly use the user's Email Address as the underlying `<option value="...">` for data binding.
  - Sorting & Pagination: The Master Settings user list MUST be paginated and ALWAYS strictly sorted alphabetically by Full Name (`firstName` + `lastName`).
  - Settings Filtering: Must mirror the Dashboard Excel-style architecture (column-based multi-select popovers, global search, and a "Clear All Filters" button). Top-bar role buttons are prohibited.

H. Dashboard Filtering, Sorting & Persistence
  - Excel-style Architecture: The Dashboard must feature a multi-select filter architecture maintaining AND/OR logic. This includes dynamic "Permit Type" filtering based on all available dataset types.
  - State Persistence: Filter states (`columnFilters`) must be persisted to `localStorage` so active filters survive logouts and page reloads.
  - Global Reset: A "Clear All Filters" button must wipe the search query, reset all arrays, and clear the saved `localStorage` state instantly without requiring a page reload.
  - Numerical Sorting: The final filtered permit list MUST always be sorted in strict numerical order based on the Permit Number (extracting the numeric value safely).

I. Physical PDF Timeframe Integrity
  - The permit's validity period (Start Date/Time and Expiry Date/Time) must be explicitly rendered in the physical PDF layout. This ensures field inspectors have immediate visual confirmation of the permit's active window.

J. Physical PDF QR Code (Digital Handover)
  - The PDF layout must include a prominently placed generated QR Code (e.g., via `qrcode.react`) that encodes the direct production URL of the specific permit. This bridges the physical-digital gap, allowing receivers to scan the printed sheet and execute the digital handover on site.

K. Mobile & iOS Accessibility (WebKit Constraints)
  - CSS Typing Bug: To prevent iOS Safari from muting text inputs, all `input` and `textarea` elements must globally enforce `-webkit-user-select: text !important;` and `touch-action: manipulation;`.
  - File Uploads (Camera vs Gallery): File input components (`<input type="file">`) must omit the `capture="environment"` attribute to ensure iOS presents both "Take Photo" and "Photo Library" native options. Always use `accept="image/*, .heic, .heif"` to support Apple formats.


3. Native Mobile Printing Architecture

A. Pure CSS Print Flow
  - The application MUST NOT use custom "Print Preview" modals, fixed positioning, absolute positioning, or `overflow-hidden` containers for documents meant to be printed. These CSS properties break the native mobile print spoolers on both legacy Android and iOS devices, resulting in blank pages.
  - The print layout must rely entirely on native standard DOM flow and `@media print` utility classes (e.g., Tailwind's `print:hidden` to hide UI elements). 

B. iOS WebKit Print Handler (CRITICAL)
  - The native `window.print()` command fails silently on iOS Safari and Chrome if fired synchronously inside a React synthetic event, or if the triggering button retains focus.
  - ALL print buttons in the application MUST implement the following strict iOS-safe handler:
    1. Remove focus from the active element: `if (document.activeElement instanceof HTMLElement) document.activeElement.blur();`
    2. Wrap the print command in a timeout to allow the event loop to settle: `setTimeout(() => { window.print(); }, 100);`


4. Agent Behavioral Rules
  - Permit creation must NEVER use dummy IDs or bypass DEMO/LIVE routing. Always preserve the original initialization payload and ITWOCX API standards. If unsure, stop and ask.

STRICT DATA ENFORCEMENT
RULE 1: I will NEVER invent permit IDs (e.g., EB-PT) or dummy data. 
RULE 2: 'Breaking Ground' permits MUST strictly use `permitType: 'BG'`. 
RULE 3: I will NEVER assume data structures; if I lack the original initialization logic, I will ask the Chief Architect before guessing. 
RULE 4: I must not break the LIVE vs DEMO environment toggles.
RULE 6: Never allow permit saving or issuing with empty required fields. Always highlight missing fields in red. Duplicate permit numbers are strictly forbidden.