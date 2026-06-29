# CAN YOU DIG IT - MASTER CONFIGURATION & KNOWLEDGE BASE
*(Source of truth for all integrations, architecture, and developer rules)*

## 1. iTwoCX Integration Architecture (The "CX" Sync)
The connection between *Can You Dig It* and the *iTwoCX* platform is strictly bound to the iTwoCX REST API. All code written by Antigravity MUST adhere to these exact constraints to avoid silent failures or API rejections.

### A. Authentication Flow
- **Encryption**: Passwords cannot be sent in plain text. They must first be encrypted via `POST /Login/EncryptPassword`.
- **Session Key**: The encrypted string is then sent to `POST /Login/ByEmail`. The API returns a `SessionKey` (or `Key`) which must be included in the `Key: [SessionKey]` header for all subsequent requests.

### B. The Dead Letter Queue (DLQ) & Webhooks
- **Async Execution**: Syncing with iTwoCX must never happen directly on the frontend. It is handled by a Firebase Cloud Function (`onPermitWritten`) acting as a background worker.
- **DLQ**: If a sync fails (due to network timeout or payload rejection), the permit status becomes `failed` and appears in the Master Settings dashboard. The user can manually trigger a retry.
- **Cooldown**: Frontend manual syncs must have a strict 15-second visual timeout/lock to prevent rate-limiting bans from the iTwoCX firewall.

### C. Document Updates & The "Silent Rejection" Trap
**CRITICAL DEVELOPER RULE:** Never send a "minimal payload" to the `PUT /Document/Update` endpoint. The iTwoCX workflow engine will return a `200 OK` but silently abort the transition, stating `"Document has no changes"` because it requires the full workflow context.

**The Golden Path for Updates:**
1. **GET**: Always call `GET /Document/GetByReference` to retrieve the *entire* document JSON object (which includes hidden workflow keys like `DocSettingId`, `Timestamp`, and `FormWorkflowId`).
2. **CLONE**: Spread the exact response object (`const updatePayload = { ...cxDoc };`).
3. **MUTATE**: Only alter the specific fields required for the status change.
4. **PUT**: Send the complete cloned object back to `PUT /Document/Update`.

### D. Exact Semantics (Status & Action Codes)
The iTwoCX workflow engine is strictly case-sensitive and uses exact semantic terminology.
- **To ISSUE a permit:**
  - `StatusName = "PERMIT ISSUED"`
  - `ActionCodes = ["ISSUE"]`
- **To CLOSE a permit:**
  - `StatusName = "CLOSED"` *(MUST NOT BE "PERMIT CLOSED")*
  - `ActionCodes = ["CLOSE"]`

### E. File Attachments (Signed PDFs)
- PDFs must be downloaded from Firebase Storage into an `ArrayBuffer` and converted to `Base64`.
- The upload must occur **BEFORE** the document status is changed to CLOSED.
- Endpoint: `POST /Attachment/Upload?documentId={Id}`
- Payload structure:
  ```json
  {
      "Name": "PF_0077_Closed.pdf",
      "ChunkId": 1,
      "ChunkTotal": 1,
      "Content": "[Base64_String]"
  }
  ```

## 2. Core Architectural Rules (PermitDetail.tsx)

### A. Permit Closure Authority Rules
The closure logic follows a strict dual-authority model:
*   **Normal Closure (Receiver):** If the work is completed or the permit expires without incidents, **only the Receiver** has the authority to execute the closure.
*   **Safety Closure / Strike (Issuer):** If a "Cease Works" protocol is triggered (e.g., strike, methodology change, etc.), the permit is locked for the Receiver. **Only the Issuer** has the authority to execute the emergency closure ("Cancel / Revoke Permit immediately").

### B. CX Synchronization Filter (Breaking Ground Family)
*   The synchronization of closures with iTwoCX (via `cxSyncPending: 'closure'`) **only applies** to the "Breaking Ground" family.
*   **Authorized Permit Types:** `BG`, `BGP`, `BE`, and `EXCAVATION`.
*   Other permits close locally in Firebase but do not trigger iTwoCX API calls.

### C. Strict PDF Backup Sequence
*   **Golden Rule:** NEVER set a permit status to `syncStatus: 'pending'` before the PDF backup is finalized.
*   **Mandatory Sequence:** 1. User confirms closure -> 2. Set status to `closed` locally -> 3. Generate PDF (html2canvas/jsPDF) -> 4. Upload to Firebase Storage and retrieve `pdfBackupUrl` -> 5. Set `syncStatus: 'pending'` and `cxSyncPending: 'closure'` to trigger the backend worker.

### D. Draft State & Issue Validations
*   **Visual State Integrity:** The status badge "ISSUED / ACTIVE" must rely strictly on the `isDraft` boolean flag (`const isIssued = permit?.isDraft === false && !isClosed;`). Never rely on the database string status, as it defaults to 'active'.
*   **Issuance Locking:** To issue a permit, it is mandatory that all 5 *Issuer Verification Checks* (Radio buttons: Scanned, Marked, Potholing, Transpower, Watercare) be completed. The issuance function must block execution if any are null or undefined.