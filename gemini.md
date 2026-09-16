CAN YOU DIG IT - MASTER CONFIGURATION & KNOWLEDGE BASE
(Source of truth for all integrations, architecture, and developer rules)

1. iTwoCX Integration Architecture (The "CX" Sync)
The connection between Can You Dig It and the iTwoCX platform is strictly bound to the iTwoCX REST API. All code written by any AI agent MUST adhere to these exact constraints to avoid silent failures or API rejections.

A. Dynamic Routing & Swagger Adherence
  - The iTwoCX API strictly requires the Project Code to be injected into the URL path, NOT passed as a query string or header. The official schema is: `/Api/{projectCode}/Endpoint/Method`.
  - Base URL Constraint: The base constant must be strictly `https://au.itwocx.com/api/25.12`.
  - Example LIVE Route: `/Api/EB/Document/GetByDocCode...`

B. The "GetByDocCode" Constraint & Pagination
  - Never use `GetByReference`. The primary document identifier shown as "REF" in the CX UI actually maps to the `DocCode` database field.
  - Query Parameter: The endpoint strictly expects the query parameter `?code=` (e.g., `?code=PF%2310582`).
  - Pagination: The `GetByDocCode` endpoint returns a **paged list**, not a direct object. The correct document must always be unpacked from the array: `const cxDoc = cxRawResponse.Items[0];`

C. Reference Number Sanitization & Zero-Padding
  - The iTwoCX workflow engine is mathematically strict. Permits must be zero-padded to a minimum of 4 digits and prefixed with the literal string `PF#`.
  - Example Logic: 
    `const cleanNumber = String(permitNumber).replace(/\D/g, "");`
    `const paddedNumber = cleanNumber.padStart(4, "0");`
    `const exactCXReference = 'PF#' + paddedNumber;`
  - The hash (`#`) MUST be safely URL-encoded in the query string: `?code=${encodeURIComponent(exactCXReference)}`.

D. Document Updates & The "Silent Rejection" Trap
CRITICAL DEVELOPER RULE: Never send a "minimal payload" to the `PUT /Document/Update` endpoint. The Golden Path for Updates:
  1. GET: Call `GET /Document/GetByDocCode` to retrieve the entire document (which includes hidden workflow keys).
  2. CLONE: Deep clone the response object.
  3. MUTATE: Only alter `StatusName` and `ActionCodes`.
  4. PUT: Send the complete cloned object back.

E. Exact Semantics (Status & Action Codes)
  - To ISSUE a permit: `StatusName = "PERMIT ISSUED"` | `ActionCodes = ["ISSUE"]`
  - To CLOSE a permit: `StatusName = "CLOSED"` | `ActionCodes = ["CLOSE"]`
  - The backend trigger must strictly evaluate `isDraft === false` or `status === 'active'` to trigger Issuance, and ONLY trigger Closure when explicitly marked as `'closed'`.

F. File Attachments (Signed PDFs)
  - PDFs must be uploaded BEFORE the document status is changed to CLOSED. Once a document is CLOSED in CX, it becomes immutable and attachments will be rejected.
  - Endpoint: `POST /Api/{projectCode}/Attachment/Upload?documentId={Id}`

2. Core Architectural Rules (PermitDetail.tsx)

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

D. Draft State & Issue Validations
  - Visual State Integrity: The status badge "ISSUED / ACTIVE" must rely strictly on the `isDraft` boolean flag (`const isIssued = permit?.isDraft === false && !isClosed;`). Never rely on the database string `status`, as it defaults to `'active'`.
  - Issuance Locking: To issue a permit, it is mandatory that all 5 Issuer Verification Checks (Radio buttons: Scanned, Marked, Potholing, Transpower, Watercare) be completed. The issuance function must block execution if any are null or undefined.

E. Legacy Data & Safe Undefined Fallbacks
  - Legacy or test permits may lack modern nested objects (like `receiverEmail` or `receiverSignature`). All frontend filter pipelines, name evaluations, and closure validations MUST safely fallback to extracting names dynamically from the email string (e.g., `first.last@domain.com` -> First: "First", Last: "Last") to prevent silent runtime crashes or unauthorized lockouts.

F. Permit-Level Role Exclusivity
  - A strict business rule dictates that an Issuer CANNOT be assigned as the Receiver on the SAME permit. The UI (Dropdowns/Selectors) and submission logic must mutually exclude the selected user across these two roles.

G. User Management & UI Binding Constraints
  - Strict Data Collection: New user creation strictly mandates First Name, Last Name, Phone Number, and Email Address.
  - Role Editing (Settings): Inline editing of user roles MUST utilize a multi-select checkbox group. It must dynamically enforce exclusivity (checking Issuer unchecks Receiver, and vice versa).
  - UI Dropdown Mapping: For all UI dropdowns, the application MUST visually render the user's Full Name but strictly use the user's Email Address as the underlying `<option value="...">` for data binding.

H. Single Environment Strictness (LIVE Only)
  - The application operates permanently and exclusively in 'LIVE' mode.
  - All DEMO mode toggles, environment switchers, and conditional routing based on environment are strictly PROHIBITED and must be eradicated from the codebase.
  - The iTwoCX Project Code is strictly hardcoded to `EB`.

I. Auth Session Persistence & Focus Stability
  - Firebase Authentication MUST explicitly await `setPersistence(auth, browserLocalPersistence)` before evaluating the initial auth state to prevent session loss on page reloads.
  - Rogue window focus events (`onblur`, `visibilitychange`, `contextmenu`) or right-click listeners must NEVER be tied to `signOut()` functions or auth state resets under any circumstances.

J. Dashboard Filtering & UI Reset
  - The Dashboard must feature an Excel-style multi-select filter architecture maintaining AND/OR logic.
  - A global "Clear All Filters" (Reset All) button is mandatory. It must wipe the search query and reset all column state arrays instantly without requiring a page reload.

K. Physical PDF Timeframe Integrity
  - The permit's validity period (Start Date/Time and Expiry Date/Time) must be explicitly rendered in the physical PDF layout. This ensures field inspectors have immediate visual confirmation of the permit's active window.