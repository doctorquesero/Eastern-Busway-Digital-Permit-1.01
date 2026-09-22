CAN YOU DIG IT - MASTER CONFIGURATION & KNOWLEDGE BASE
(Source of truth for all integrations, architecture, and developer rules)

1. iTwoCX Integration Architecture (The "CX" Sync)
The connection between Can You Dig It and the iTwoCX platform is strictly bound to the iTwoCX REST API (v26.08). All code written by any AI agent MUST adhere to these exact constraints to avoid silent failures, WAF blocks, or API rejections.

A. Dynamic Routing & Swagger Adherence
  - The iTwoCX API strictly requires the Project Code to be injected into the URL path, NOT passed as a query string or header. The official schema is: `/Api/{projectCode}/Endpoint/Method`.
  - Base URL Constraint: The base constant must be strictly `https://au.itwocx.com/api/26.08`.
  - Passwords: As of v26.08, login payloads must use plain-text `Password` (PascalCase), strictly avoiding the deprecated `EncryptedPassword` field.

B. WAF Bypass & Headers Constraint
  - iTwoCX employs a strict Web Application Firewall (WAF) that rejects automated backend scripts with a 403 HTML response.
  - ALL outbound HTTP requests (Fetch/Axios) to iTwoCX MUST globally inject standard browser headers:
    `"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"`
    `"Accept": "application/json"`

C. The Document Search API Constraint (v26.08)
  - CRITICAL RULE: Never use `GetByDocCode` to search for a specific permit. `DocCode` refers strictly to the Form Type (e.g., `PF`), while the permit number (e.g., `PF#0094`) is the `cx_reference`.
  - To find a document, you MUST send a POST request to `/Api/{projectCode}/Document/Search`.
  - The Search payload MUST strictly follow this structure:
    `{ "CriterionList": { "cx_reference": "PF#0094" }, "MaxNumber": 1 }`
  - V26.08 Response Handling: The Search endpoint returns an array containing the internal numeric ID directly (e.g., `[21431212]`). The worker MUST extract this primitive `Id` for all subsequent operations.

D. Reference Number Sanitization & Zero-Padding
  - The iTwoCX workflow engine is mathematically strict. Permits must be zero-padded to a minimum of 4 digits and prefixed with the literal string `PF#`.
  - Example Logic: 
    `const cleanNumber = String(permitNumber).replace(/\D/g, "");`
    `const paddedNumber = cleanNumber.padStart(4, "0");`
    `const exactCXReference = 'PF#' + paddedNumber;`
  - Double URL-Encoding Trap: Do NOT manually `encodeURIComponent()` the reference if the HTTP client (like Axios) auto-encodes query/body parameters. Pass the raw string (e.g., `PF#0094`).

E. Document Updates (Minimal Payload)
  - In v26.08, deep cloning the entire document is NO LONGER REQUIRED.
  - To update a document via `PUT /Api/{projectCode}/Document/Update`, send a minimal payload containing ONLY the extracted internal `Id` and the fields to mutate.
  - Example Payload: `{ "Id": 21431212, "StatusName": "PERMIT ISSUED", "ActionCodes": ["ISSUE"] }`

F. Exact Semantics (Status & Action Codes)
  - To ISSUE a permit: `StatusName = "PERMIT ISSUED"` | `ActionCodes = ["ISSUE"]`
  - To CLOSE a permit: `StatusName = "CLOSED"` | `ActionCodes = ["CLOSE"]`
  - The backend trigger must strictly evaluate `isDraft === false` or `status === 'active'` to trigger Issuance, and ONLY trigger Closure when explicitly marked as `'closed'`.

G. File Attachments (Signed PDFs)
  - PDFs must be uploaded BEFORE the document status is changed to CLOSED. Once a document is CLOSED in CX, it becomes immutable and attachments will be rejected.
  - Endpoint: `POST /Api/{projectCode}/Attachment/Upload?documentId={Id}` (Using the extracted internal `Id`).

H. Session Token Auto-Renewal (403 HTML Error Handling)
  - The iTwoCX API returns a 403 HTML login page when the Session Token expires (or if WAF headers are missing). The backend MUST catch any 403/401 or HTML parsing errors, trigger a new `cxLogin()` to fetch a fresh token, and automatically retry the failed request once before sending it to the Dead Letter Queue.

I. Environment Toggle & Dynamic CX Routing (LIVE vs DEMO)
  - The application supports switching between LIVE and DEMO data modes via the Master Settings UI toggle.
  - The backend sync worker MUST dynamically determine the iTwoCX Project Code based on the Firestore collection path of the triggered document.
  - If the document originates from the `permits_demo` collection, the worker must set `cxProjectCode = "EB-DEMO"`.
  - If the document originates from the standard `permits` collection, the worker must set `cxProjectCode = "EB"`.
  - Manual `.env` overrides for the project code are strictly deprecated; the database origin is the absolute source of truth for routing.


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