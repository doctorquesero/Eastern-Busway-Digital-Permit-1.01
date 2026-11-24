// ARCHIVO: functions/src/index.ts
import * as functions from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
require("dotenv").config();
const corsHandler = require("cors")({ origin: true });
import { Resend } from 'resend';
import { Agent as UndiciAgent, fetch as undiciFetch } from 'undici';

// Native fetch ignores per-call timeouts; large PDF uploads need a dispatcher with extended limits (kept under the 120s function timeout).
const uploadDispatcher = new UndiciAgent({ headersTimeout: 110000, bodyTimeout: 110000 });

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();

const CX_API_BASE = "https://au.itwocx.com/api/26.08";
const CX_USER_AGENT = "CanYouDigIt-Backend/1.0";

// ============================================================================
// 📊 PERMIT TYPE CONFIG TABLE (CX Dictionary)
// ============================================================================
interface PermitTypeSettings {
    allowed: boolean;
    pdfPrefix: string;
}

const PERMIT_CONFIG: Record<string, PermitTypeSettings> = {
    // Breaking Ground & Excavations
    'breaking_ground': { allowed: true, pdfPrefix: 'Breaking_Ground' },
    'BG': { allowed: true, pdfPrefix: 'Breaking_Ground' },
    'bg': { allowed: true, pdfPrefix: 'Breaking_Ground' },
    'mechanical': { allowed: true, pdfPrefix: 'Mechanical_Excavation' },
    'non_mechanical': { allowed: true, pdfPrefix: 'Non_Mechanical_Excavation' },
    // Core Permits
    'hot_work': { allowed: true, pdfPrefix: 'Hot_Work' },
    'confined_space': { allowed: true, pdfPrefix: 'Confined_Space' },
    'working_at_heights': { allowed: true, pdfPrefix: 'Working_At_Heights' },
    'lifting_operations': { allowed: true, pdfPrefix: 'Lifting_Operations' },
    // Sub-Types & Extras
    'road_corridor': { allowed: true, pdfPrefix: 'Road_Corridor' },
    'isolation': { allowed: true, pdfPrefix: 'Isolation' },
    'electrical': { allowed: true, pdfPrefix: 'Electrical_Isolation' },
    'environmental': { allowed: true, pdfPrefix: 'Environmental' },
    'HP': { allowed: true, pdfPrefix: 'High_Powered_Handheld_Saw' },
    'handheld_saw': { allowed: true, pdfPrefix: 'High_Powered_Handheld_Saw' }
};

const getBaseOptions = (sessionKey: string, method: string = "GET") => {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": CX_USER_AGENT
    };
    if (sessionKey) {
        headers["Key"] = sessionKey;
    }
    return { method, headers };
};

const safeParseJSON = async (response: Response, step: string) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`[${step}] iTwoCX returned HTML instead of JSON. Fragment: ${text.substring(0, 100)}...`);
    }
};

export const cxLogin = async (email?: string, password?: string): Promise<any> => {
    const targetEmail = email || process.env.CX_EMAIL || process.env.CX_MASTER_EMAIL;
    const targetPassword = password || process.env.CX_PASSWORD || process.env.CX_MASTER_PASSWORD;

    if (!targetEmail || !targetPassword) {
        throw new Error("Missing email or password for CX login.");
    }

    let loginRes: Response;
    try {
        // P0 Critical Hotfix (iTwoCX v26.08 REST API):
        // The deprecated Login/EncryptPassword endpoint and EncryptedPassword field have been completely eradicated.
        // Client-side hashing has been removed. Authenticate strictly using plain-text Password over HTTPS.
        loginRes = await fetch(`${CX_API_BASE}/Api/Login/ByEmail`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": CX_USER_AGENT
            },
            body: JSON.stringify({
                Email: targetEmail,
                Password: targetPassword
            })
        });
        const rawLogin = await loginRes.text();

        let jsonRes;
        try {
            jsonRes = JSON.parse(rawLogin);
        } catch (e) {
            throw new Error(`iTwoCX returned HTML on Login. Wait 30s. Fragment: ${rawLogin.substring(0, 100)}...`);
        }

        if (!loginRes.ok) {
            const errs = jsonRes.ErrorMessages?.join(', ') || jsonRes.Message || "Unknown login error";
            throw new Error(`CX Login Rejected: ${errs}`);
        }

        return jsonRes;
    } catch (e: any) {
        throw new Error(`Login Failed: ${e.message}`);
    }
};

export const performCXLogin = cxLogin;

const extractSessionKey = (data: any, depth = 0): string | null => {
    if (typeof data === 'string') return data.trim().length > 8 ? data.trim() : null;
    if (!data || typeof data !== 'object' || depth > 2) return null;
    const names = ['sessionkey', 'key', 'token', 'sessiontoken', 'sessionid', 'accesstoken'];
    for (const k of Object.keys(data)) {
        if (names.includes(k.toLowerCase()) && typeof data[k] === 'string' && data[k]) return data[k];
    }
    for (const k of Object.keys(data)) {
        if (data[k] && typeof data[k] === 'object') {
            const nested = extractSessionKey(data[k], depth + 1);
            if (nested) return nested;
        }
    }
    return null;
};

const renewCXSession = async (projectCode: string): Promise<string> => {
    const loginData = await cxLogin();
    const key = extractSessionKey(loginData);
    if (!key) {
        const shape = typeof loginData === 'object' && loginData ? Object.keys(loginData).join(',') : typeof loginData;
        const errs = Array.isArray(loginData?.ErrorMessages) ? loginData.ErrorMessages.join('; ') : '';
        throw new Error(`Authentication failure: Could not map session key. Login response fields: [${shape}]. ${errs}`.trim());
    }
    const authPayload: any = { updatedAt: new Date().toISOString() };
    authPayload[projectCode.includes('DEMO') ? 'demo_session_key' : 'session_key'] = key;
    await db.collection('settings').doc('cx_auth').set(authPayload, { merge: true });
    return key;
};

// ============================================================================
// 📧 EMAIL ENGINE (Resend API)
// ============================================================================
export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// Default Resend testing sender until a custom domain is verified.
const EMAIL_FROM = 'Can You Dig It <onboarding@resend.dev>';

const toAddressList = (v?: string | string[]): string[] | undefined => {
    if (!v) return undefined;
    const list = (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : undefined;
};

export const sendEmail = async (opts: { to: string | string[]; cc?: string | string[]; subject: string; html: string; attachments?: { filename: string; path: string }[] }) => {
    const resend = new Resend(RESEND_API_KEY.value());
    const { data, error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: toAddressList(opts.to) as string[],
        cc: toAddressList(opts.cc),
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments
    });
    // Resend reports API failures in `error` instead of throwing.
    if (error) throw new Error(`Resend error: ${error.name || ''} ${error.message || ''}`.trim());
    return data;
};

// ============================================================================
// ASYNC PERMIT SYNC WORKER
// ============================================================================
export const processPendingPermitSync = async (
    permitId: string,
    newValue: any,
    previousValue: any,
    collectionName: string = 'permits'
) => {
    // 🛡️ REGLAS DE DESPERTADOR AMPLIADAS
    const isNowIssued = (newValue.isDraft === false && previousValue.isDraft !== false) ||
        (newValue.status === 'active' && previousValue.status !== 'active') ||
        (newValue.status === 'issued' && previousValue.status !== 'issued') ||
        (newValue.status === 'pending_approval' && previousValue.status !== 'pending_approval');

    const isNowClosed = (newValue.status === 'closed' && previousValue.status !== 'closed') ||
        (newValue.cxSyncPending === 'closure' && previousValue.cxSyncPending !== 'closure');

    const isPendingRetry = newValue.syncStatus === 'pending' || newValue.sync_status === 'pending';

    if (!isNowIssued && !isNowClosed && !isPendingRetry) {
        console.log(`[CX Sync] 🛑 Sleep mode for ${permitId}. No valid CX trigger found.`);
        return;
    }

    let action = 'Issuance';
    if (isNowClosed || newValue.status === 'closed' || newValue.cxSyncPending === 'closure') {
        action = 'Closure';
    } else {
        action = 'Issuance';
    }

    let targetProjectCode = 'EB-DEMO';

    try {
        const permitNumber = newValue.itwocxNumber || newValue.permitNumber;
        if (!permitNumber) {
            throw new Error("Permit has no iTwoCX Number or reference ID assigned.");
        }

        // Rule 1.C: iTwoCX requires the exact PF# reference format with zero-padding from itwocxNumber only.
        const cleanNumber = String(permitNumber).replace(/\D/g, "");
        if (!cleanNumber) throw new Error(`Permit number '${permitNumber}' contains no digits.`);
        const paddedNumber = cleanNumber.padStart(4, "0");
        const exactCXReference = 'PF#' + paddedNumber;

        const rawType = newValue.permitType || newValue.type || 'unknown';
        const typeConfig = PERMIT_CONFIG[rawType];

        if (!typeConfig || !typeConfig.allowed) {
            console.log(`[CX Sync] Skipping ${permitId} - Type '${rawType}' is not mapped for CX integration.`);
            return;
        }

        const settingsDoc = await db.collection('settings').doc('config').get();
        const configData = settingsDoc.data();

        if (newValue.env === 'LIVE' || newValue.env === 'live') {
            targetProjectCode = 'EB';
        } else if (newValue.env === 'DEMO' || newValue.env === 'demo' || newValue.environment === 'demo') {
            targetProjectCode = 'EB-DEMO';
        } else {
            const isGlobalDemo = configData?.environment === 'demo_mode' || configData?.acceptLiveTraffic === false;
            targetProjectCode = isGlobalDemo ? 'EB-DEMO' : 'EB';
        }

        // 26.08: DocCode is the document TYPE ("PF"); the REF shown in the CX UI is the Reference field.
        const getUrl = `${CX_API_BASE}/Api/${targetProjectCode}/Document/GetByReference?reference=${encodeURIComponent(exactCXReference)}`;

        // Rule 1G: pre-flight fresh login so the lookup never runs on an expired token.
        let sessionKey: string = await renewCXSession(targetProjectCode);

        console.log('[CX Sync Diagnostic] Fetching URL:', getUrl, '| project:', targetProjectCode, '| raw permitNumber:', permitNumber, '| reference:', exactCXReference);

        const fetchCxDoc = async (url: string, step: string): Promise<any> => {
            const res = await fetch(url, getBaseOptions(sessionKey, "GET"));
            try {
                return await safeParseJSON(res, step);
            } catch (parseError: any) {
                if (parseError.message.includes("returned HTML")) {
                    console.warn(`[CX Sync] Token expired for ${targetProjectCode}. Deleting cached token.`);
                    await db.collection('settings').doc('cx_auth').delete();
                    throw new Error("CX Session Token expired. Cleared auth cache. Please press RETRY SYNC again to generate a new token.");
                }
                throw parseError;
            }
        };

        const permitRef = `PF#${paddedNumber}`;
        const unwrapDoc = (r: any): any => (r?.Items ? r.Items[0] : r);

        let cxRawResponse: any = await fetchCxDoc(getUrl, `GET for Async ${action}`);
        let cxDoc: any = unwrapDoc(cxRawResponse);

        const storedCxId = newValue.cxDocumentId;
        if ((!cxDoc || !cxDoc.Id) && storedCxId) {
            console.warn(`[CX Sync] GetByReference found nothing for ${permitRef}. Falling back to GetById/${storedCxId}.`);
            cxRawResponse = await fetchCxDoc(`${CX_API_BASE}/Api/${targetProjectCode}/Document/GetById/${encodeURIComponent(String(storedCxId))}`, `GET by Id for Async ${action}`);
            cxDoc = unwrapDoc(cxRawResponse);
        }

        if (!cxDoc || !cxDoc.Id) {
            const shape = cxRawResponse && typeof cxRawResponse === 'object' ? Object.keys(cxRawResponse).join(',') : typeof cxRawResponse;
            throw new Error(`Invalid document received from CX for ${permitRef}. Response fields: [${shape}].`);
        }
        console.log(`[SONAR] CX DOC DATA FOR ${permitRef} [TYPE: ${rawType}]:`, JSON.stringify({
            Id: cxDoc.Id,
            StatusName: cxDoc.StatusName,
            ActionCodes: cxDoc.ActionCodes || "N/A"
        }));

        if (action === 'Closure' && newValue.pdfBackupUrl) {
            try {
                console.log(`[DLQ] Downloading PDF from Firebase to upload to CX...`);
                const pdfRes = await fetch(newValue.pdfBackupUrl);
                const arrayBuffer = await pdfRes.arrayBuffer();
                const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

                const uploadUrl = `${CX_API_BASE}/Api/${targetProjectCode}/Attachment/Upload?documentId=${cxDoc.Id}`;

                const uploadPayload = {
                    Name: `${typeConfig.pdfPrefix}_${paddedNumber}_Closed.pdf`,
                    ChunkId: 1,
                    ChunkTotal: 1,
                    Content: base64Pdf
                };

                const attemptUpload = async () => {
                    const uploadOptions: any = getBaseOptions(sessionKey as string, "POST");
                    uploadOptions.body = JSON.stringify(uploadPayload);
                    const res: any = await undiciFetch(uploadUrl, { ...uploadOptions, dispatcher: uploadDispatcher });
                    const text = await res.text();
                    let data: any = null;
                    try { data = JSON.parse(text); } catch { /* non-JSON body handled below */ }
                    const expired = res.status === 401 || res.status === 403 || data === null;
                    return { expired, data, status: res.status };
                };

                let result = await attemptUpload();
                if (result.expired) {
                    console.warn(`[CX Sync] Upload rejected (HTTP ${result.status}). Renewing session and retrying once.`);
                    sessionKey = await renewCXSession(targetProjectCode);
                    result = await attemptUpload();
                }

                if (result.expired) {
                    throw new Error(`CX PDF upload rejected after session renewal (HTTP ${result.status}).`);
                }
                if (result.data && result.data.IsSuccess === false) {
                    throw new Error(`CX PDF upload failed: ${result.data.ErrorMessages?.join(', ') || 'unknown error'}`);
                }
                console.log(`[DLQ] ✅ Successfully uploaded PDF to CX for ${permitRef}`);
            } catch (pdfErr: any) {
                console.error("[DLQ] Failed to upload PDF to CX:", pdfErr.message);
                throw pdfErr;
            }
        }

        const updateUrl = `${CX_API_BASE}/Api/${targetProjectCode}/Document/Update`;
        const options: any = getBaseOptions(sessionKey as string, "PUT");

        const updatePayload: any = JSON.parse(JSON.stringify(cxDoc));

        if (action === 'Issuance') {
            updatePayload.StatusName = "PERMIT ISSUED";
            updatePayload.ActionCodes = ["ISSUE"];
        } else {
            updatePayload.StatusName = "CLOSED";
            updatePayload.ActionCodes = ["CLOSE"];
        }

        options.body = JSON.stringify(updatePayload);

        const updateRes = await fetch(updateUrl, options);
        const updateData = await safeParseJSON(updateRes, `PUT for Async ${action}`);

        if (updateData && updateData.IsSuccess === false) {
            const errorMessage = updateData.ErrorMessages?.join(', ') || `API rejected the ${action} update for ${permitRef}.`;
            throw new Error(errorMessage);
        }

        await db.collection(collectionName).doc(permitId).update({
            sync_status: 'synced', syncStatus: 'synced', cxDocumentId: cxDoc.Id, cxSyncPending: null, cxSyncError: null, sync_error: null, lastSyncedAt: new Date().toISOString()
        });

        console.log(`[CX Sync] ✅ Successfully executed ${action} for ${permitRef}`);

    } catch (error: any) {
        console.error(`[CX Sync] ❌ Failed to execute async ${action} for ${permitId}:`, error);

        const errorMessage = error.message || String(error);

        await db.collection(collectionName).doc(permitId).update({
            syncStatus: 'failed',
            sync_status: 'failed',
            cxSyncError: errorMessage,
            sync_error: errorMessage
        });

        const errorCleanNumber = String(newValue.itwocxNumber || newValue.permitNumber || '').replace(/\D/g, "");
        const errorPadded = errorCleanNumber ? errorCleanNumber.padStart(4, "0") : 'UNKNOWN';
        const permitRef = `PF#${errorPadded}`;

        const isPendingRetry = newValue.syncStatus === 'pending' || newValue.sync_status === 'pending';

        if (!isPendingRetry) {
            const userInField = newValue.siteEngineerSignature?.name || newValue.createdBy || 'Unknown User';

            const mailAttachments: any[] = [];
            if (newValue.pdfBackupUrl) {
                mailAttachments.push({
                    filename: `Backup_${permitRef}.pdf`,
                    path: newValue.pdfBackupUrl
                });
            }

            const ALERT_EMAILS = 'dietrich.is.coding@gmail.com, dietrich.is.coding@gmail.com';

            const mailOptions = {
                to: ALERT_EMAILS,
                subject: `🚨 ❌ CX SYNC FAILURE - ${permitRef}`,
                html: `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
                        <div style="background: #fee2e2; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; border: 1px solid #fca5a5;">
                            <span style="font-size: 24px;">🚨</span>
                            <h2 style="color: #b91c1c; margin: 0; font-size: 20px;">iTwoCX Background Sync Failed</h2>
                        </div>
                        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 20px;">
                            The background worker encountered a critical error while attempting to push a permit state change to the iTwoCX workflow engine.
                        </p>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px; overflow: hidden; border: 1px solid #f3f4f6;">
                            <tr>
                                <td style="padding: 12px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb; width: 140px;">Permit Ref</td>
                                <td style="padding: 12px; color: #111827; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${permitRef}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">Failed Action</td>
                                <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6;">${action}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">User in Field</td>
                                <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6;">${userInField || 'Not recorded'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">Project Code</td>
                                <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6;">${targetProjectCode}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 12px; font-weight: bold; color: #dc2626;">Error Details</td>
                                <td style="padding: 8px 12px; color: #dc2626; font-family: monospace; font-size: 13px;">${errorMessage}</td>
                            </tr>
                        </table>
                    </div>
                `,
                attachments: mailAttachments
            };
            try { await sendEmail(mailOptions); } catch (e) { console.error('[Mail] CX failure alert failed:', (e as any)?.message || e); }
        }
    }

    const isNewlyIssuedNotif = (newValue.isDraft === false && previousValue.isDraft !== false) ||
        (newValue.status === 'active' && previousValue.status !== 'active') ||
        (newValue.status === 'pending_approval' && previousValue.status !== 'pending_approval');

    const isMechanical = newValue.excavationType === 'mechanical';
    const needsApprover = !newValue.approverSignature?.data;

    if (isNewlyIssuedNotif && isMechanical && needsApprover) {
        const engineerName = newValue.siteEngineerSignature?.name || 'Not specified';
        const engineerEmail = newValue.createdBy || 'Email not recorded';

        let approverEmailsList = 'tommy.temple@easternbusway.nz, krishna.nand@easternbusway.nz';
        try {
            const settingsDoc = await db.collection('appSettings').doc('global').get();
            if (settingsDoc.exists) {
                const roleAssignments = settingsDoc.data().roleAssignments || [];
                const approvers = roleAssignments
                    .filter((u: any) => u.role === 'Approver')
                    .map((u: any) => u.email);

                if (approvers.length > 0) {
                    approverEmailsList = approvers.join(', ');
                }
            }
        } catch (err) { }

        const notifCleanNumber = String(newValue.itwocxNumber || newValue.permitNumber || '').replace(/\D/g, "");
        const notifPadded = notifCleanNumber ? notifCleanNumber.padStart(4, "0") : 'UNKNOWN';
        const permitRef = `PF#${notifPadded}`;

        const ALERT_EMAILS = 'dietrich.is.coding@gmail.com, dietrich.is.coding@gmail.com';

        const notifyOptions = {
            to: approverEmailsList,
            cc: ALERT_EMAILS,
            subject: `🚨 ACTION REQUIRED: Part B Approval Pending - ${permitRef}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <h2 style="color: #d97706; margin-top: 0; border-bottom: 2px solid #fde68a; padding-bottom: 12px;">
                        🚨 Mechanical Excavation - Approval Required
                    </h2>
                    <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                        A mechanical excavation permit (<strong>${permitRef}</strong>) has been issued and requires Part B approval 
                        from an authorised Approver before work can proceed on site.
                    </p>
                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">Permit Reference</td>
                            <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: bold;">${permitRef}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">Site Engineer</td>
                            <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6;">${engineerName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; color: #374151; border-bottom: 1px solid #f3f4f6;">Engineer Email</td>
                            <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #f3f4f6;">${engineerEmail}</td>
                        </tr>
                    </table>
                </div>
            `
        };
        try { await sendEmail(notifyOptions); } catch (error) { console.error('[Mail] Approval notification failed:', (error as any)?.message || error); }
    }
};

export const onPermitWritten = onDocumentWritten({ document: 'permits/{permitId}', memory: '1GiB', timeoutSeconds: 120, secrets: [RESEND_API_KEY] }, async (event: any) => {
    if (!event.data || !event.data.after || !event.data.after.exists) return;
    const newValue = event.data.after.data();
    const previousValue = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    await processPendingPermitSync(event.params.permitId, newValue, previousValue, 'permits');
});

export const onDemoPermitWritten = onDocumentWritten({ document: 'permits_demo/{permitId}', memory: '1GiB', timeoutSeconds: 120, secrets: [RESEND_API_KEY] }, async (event: any) => {
    if (!event.data || !event.data.after || !event.data.after.exists) return;
    const newValue = event.data.after.data();
    const previousValue = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    await processPendingPermitSync(event.params.permitId, newValue, previousValue, 'permits_demo');
});

// ============================================================================
// 🛡️ DATE SHIELD UTILITY (October 13, 2026 Threshold)
// ============================================================================
const SHIELD_THRESHOLD_DATE = '2026-10-13';

/**
 * Validates whether a permit was created ON or AFTER the strict threshold date of October 13, 2026.
 * Silently rejects missing, null, invalid, or legacy pre-October 13, 2026 creation dates.
 */
export const isCreatedOnOrAfterShieldDate = (raw: any): boolean => {
    if (!raw) return false;
    let d: Date | null = null;
    if (typeof raw.toDate === 'function') {
        try {
            d = raw.toDate();
        } catch {
            return false;
        }
    } else if (typeof raw === 'object' && raw !== null && (typeof raw.seconds === 'number' || typeof raw._seconds === 'number')) {
        const secs = typeof raw.seconds === 'number' ? raw.seconds : raw._seconds;
        d = new Date(secs * 1000);
    } else if (typeof raw === 'number') {
        const ms = raw < 1e11 ? raw * 1000 : raw;
        d = new Date(ms);
    } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        d = new Date(trimmed);
    }
    if (!d || isNaN(d.getTime())) return false;

    try {
        const nzDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
        if (nzDateStr >= SHIELD_THRESHOLD_DATE) return true;
    } catch { }

    try {
        const utcDateStr = d.toISOString().slice(0, 10);
        if (utcDateStr >= SHIELD_THRESHOLD_DATE) return true;
    } catch { }

    return false;
};

// ============================================================================
// 🕒 SCHEDULED EMAIL REPORTING HELPERS & AGGREGATORS
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (unsafe: any): string => {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const getPermitTypeLabel = (data: any): string => {
    const rawType = String(data.permitType || data.type || '').trim().toLowerCase();
    const map: Record<string, string> = {
        'bg': 'Breaking Ground',
        'breaking_ground': 'Breaking Ground',
        'excavation': 'Breaking Ground',
        'mechanical': 'Mechanical Excavation',
        'non_mechanical': 'Non-Mechanical Excavation',
        'pump': 'Pump / Dewatering Permit',
        'hot_work': 'Hot Work Permit',
        'confined_space': 'Confined Space Permit',
        'working_at_heights': 'Working at Heights Permit',
        'lifting_operations': 'Lifting Operations Permit',
        'road_corridor': 'Road Corridor Permit',
        'isolation': 'Isolation Permit',
        'electrical': 'Electrical Isolation Permit',
        'environmental': 'Environmental Permit'
    };
    if (map[rawType]) return map[rawType];
    return rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : 'Excavation / Breaking Ground';
};

const formatPermitRef = (data: any, docId: string): string => {
    const rawNum = data.itwocxNumber ?? data.permitNumber ?? data.number ?? docId;
    const cleanNumber = String(rawNum).replace(/\D/g, '');
    if (!cleanNumber) {
        return `PF#${docId}`;
    }
    const padded = cleanNumber.padStart(4, '0');
    return `PF#${padded}`;
};

interface PermitExpiryInfo {
    isExpired: boolean;
    expiryDisplay: string;
    daysOverdue: number;
}

// Converts a Pacific/Auckland wall-clock date (YYYY-MM-DD) and time (HH:MM) to the true UTC instant, DST-aware, independent of server timezone.
const aucklandWallClockToDate = (dateOnly: string, time: string): Date => {
    const [y, m, d] = dateOnly.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Pacific/Auckland', hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
    });
    const offsetAt = (utcMs: number): number => {
        const p: any = {};
        for (const part of fmt.formatToParts(new Date(utcMs))) p[part.type] = Number(part.value);
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs;
    };
    let utcMs = wallAsUtc - offsetAt(wallAsUtc);
    utcMs = wallAsUtc - offsetAt(utcMs);
    return new Date(utcMs);
};

/**
 * Evaluates whether an active permit has reached or passed its expiry date in Pacific/Auckland time.
 */
export const parsePermitExpiry = (data: any, referenceDate: Date = new Date(), permitId: string = 'unknown'): PermitExpiryInfo => {
    const candidates = [
        { val: data.endDate, time: data.endTime },
        { val: data.expiryDate, time: data.expiryTime },
        { val: data.validTo, time: null }
    ];

    const aucklandDateStr = referenceDate.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const aucklandTimeStr = referenceDate.toLocaleTimeString('en-GB', { timeZone: 'Pacific/Auckland', hour12: false });

    for (const c of candidates) {
        const raw = c.val;
        if (!raw) continue;

        // 1. Firestore Timestamp
        if (typeof raw?.toDate === 'function') {
            try {
                const d = raw.toDate();
                if (!isNaN(d.getTime())) {
                    const diffMs = referenceDate.getTime() - d.getTime();
                    const isExpired = diffMs > 0;
                    const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                    const expiryDisplay = d.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
                    return { isExpired, expiryDisplay, daysOverdue };
                }
            } catch { }
        }

        // 2. Object with seconds/_seconds
        if (typeof raw === 'object' && raw !== null && (typeof raw.seconds === 'number' || typeof raw._seconds === 'number')) {
            const secs = typeof raw.seconds === 'number' ? raw.seconds : raw._seconds;
            const d = new Date(secs * 1000);
            if (!isNaN(d.getTime())) {
                const diffMs = referenceDate.getTime() - d.getTime();
                const isExpired = diffMs > 0;
                const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                const expiryDisplay = d.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
                return { isExpired, expiryDisplay, daysOverdue };
            }
        }

        // 3. Epoch number
        if (typeof raw === 'number') {
            const ms = raw < 1e11 ? raw * 1000 : raw;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) {
                const diffMs = referenceDate.getTime() - d.getTime();
                const isExpired = diffMs > 0;
                const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                const expiryDisplay = d.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
                return { isExpired, expiryDisplay, daysOverdue };
            }
        }

        // 4. String (YYYY-MM-DD or ISO)
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const ymdMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
            if (ymdMatch) {
                const dateOnly = ymdMatch[1];
                const timeStr = typeof c.time === 'string' && c.time.trim() ? c.time.trim() : '';
                const expiryDisplay = timeStr ? `${dateOnly} ${timeStr}` : dateOnly;

                let isExpired = false;
                if (dateOnly < aucklandDateStr) {
                    isExpired = true;
                } else if (dateOnly === aucklandDateStr) {
                    if (timeStr) {
                        isExpired = timeStr <= aucklandTimeStr.slice(0, 5);
                    } else {
                        // At or after 17:00 (when reminder runs), standard day shift has concluded
                        isExpired = aucklandTimeStr >= '17:00';
                    }
                }

                let daysOverdue = 0;
                if (isExpired) {
                    const permitDate = aucklandWallClockToDate(dateOnly, /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : '17:00');
                    const diffMs = referenceDate.getTime() - permitDate.getTime();
                    daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                }

                return { isExpired, expiryDisplay, daysOverdue };
            }

            const d = new Date(trimmed);
            if (!isNaN(d.getTime())) {
                const diffMs = referenceDate.getTime() - d.getTime();
                const isExpired = diffMs > 0;
                const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                const expiryDisplay = trimmed.includes('T') || trimmed.includes(':')
                    ? d.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
                    : trimmed;
                return { isExpired, expiryDisplay, daysOverdue };
            }
        }
    }

    console.warn(`[parsePermitExpiry] ⚠️ Permit ${permitId} has a missing or malformed expiry (endDate/expiryDate/validTo); treated as not expired.`);
    return { isExpired: false, expiryDisplay: 'Not specified', daysOverdue: 0 };
};

interface ExpiredPermitRecord {
    id: string;
    permitRef: string;
    permitType: string;
    location: string;
    expiryDisplay: string;
    daysOverdue: number;
    receiverEmail: string;
    receiverName: string;
    issuerEmail: string;
    issuerName: string;
    url: string;
}

// Mirrors the frontend's getDisplayNameFromEmail: "sudip.basnet@x.nz" -> "Sudip Basnet".
const getDisplayNameFromEmail = (email: string): string => {
    const parts = String(email || '').split('@')[0].split('.').filter(Boolean);
    return parts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
};

const normalizeName = (value: any): string =>
    String(value || '').toLowerCase().replace(/[.,_]+/g, ' ').replace(/\s+/g, ' ').trim();

// Order-insensitive key so "Basnet Sudip" and "Sudip Basnet" match.
const sortedNameKey = (value: any): string => normalizeName(value).split(' ').filter(Boolean).sort().join(' ');

/**
 * Builds an in-memory directory of users from appSettings/global and the users collection
 * to reliably resolve names/IDs to emails and identify registered Issuers.
 * Users created via the app often have only an email (no firstName/lastName), so a name is also derived from the email local part.
 */
const buildUserEmailDirectory = async (): Promise<{
    emailByName: Map<string, string>;
    emailById: Map<string, string>;
    issuerEmails: Set<string>;
}> => {
    const emailByName = new Map<string, string>();
    const emailById = new Map<string, string>();
    const issuerEmails = new Set<string>();

    const register = (u: any, email: string, idCandidates: any[]) => {
        const names = [
            `${u.firstName || ''} ${u.lastName || ''}`,
            u.name,
            u.displayName,
            u.fullName,
            getDisplayNameFromEmail(email)
        ];
        for (const n of names) {
            const key = normalizeName(n);
            if (key && !emailByName.has(key)) emailByName.set(key, email);
            const sorted = sortedNameKey(n);
            if (sorted && !emailByName.has(`~${sorted}`)) emailByName.set(`~${sorted}`, email);
        }
        for (const id of idCandidates) {
            if (id) emailById.set(String(id), email);
        }
        const roles: string[] = [];
        if (Array.isArray(u.roles)) roles.push(...u.roles.map((r: any) => String(r).toLowerCase()));
        if (typeof u.roles === 'string') roles.push(u.roles.toLowerCase());
        if (typeof u.role === 'string') roles.push(u.role.toLowerCase());
        if (roles.some(r => r.includes('issuer') || r.includes('master'))) {
            issuerEmails.add(email);
        }
    };

    try {
        const settingsSnap = await db.collection('appSettings').doc('global').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data();
            const assignments = Array.isArray(data?.roleAssignments) ? data.roleAssignments : [];
            for (const u of assignments) {
                const email = String(u.email || '').trim().toLowerCase();
                if (!EMAIL_REGEX.test(email)) continue;
                register(u, email, [u.uid, u.id]);
            }
        }
        console.log(`[Directory] appSettings/global roleAssignments loaded; directory size so far: ${emailByName.size} name keys.`);
    } catch (err: any) {
        console.warn('[Directory] Failed to read appSettings/global:', err?.message || err);
    }

    try {
        const usersSnap = await db.collection('users').get();
        for (const userDoc of usersSnap.docs) {
            const u = userDoc.data();
            const email = String(u.email || userDoc.id || '').trim().toLowerCase();
            if (!EMAIL_REGEX.test(email)) continue;
            register(u, email, [userDoc.id, u.uid, u.id]);
        }
        console.log(`[Directory] users collection: ${usersSnap.size} docs. Total name keys: ${emailByName.size}, id keys: ${emailById.size}.`);
    } catch (err: any) {
        console.warn('[Directory] Failed to read users collection:', err?.message || err);
    }

    return { emailByName, emailById, issuerEmails };
};

/**
 * Resolves the CURRENT receiver's email. Order: latest handover log (the active receiver), then permit-level fields,
 * each tried as email -> user ID -> name against the directory.
 */
const resolveReceiverEmail = (
    data: any,
    directory: { emailByName: Map<string, string>; emailById: Map<string, string> }
): string | null => {
    const asEmail = (v: any): string | null => {
        const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
        return s && EMAIL_REGEX.test(s) ? s : null;
    };
    const byName = (v: any): string | null => {
        const key = normalizeName(v);
        if (!key) return null;
        return directory.emailByName.get(key) || directory.emailByName.get(`~${sortedNameKey(v)}`) || null;
    };

    const handovers: any[] = Array.isArray(data.handoverLogs) ? data.handoverLogs : [];
    const lastHandover = handovers.length > 0 ? handovers[handovers.length - 1] : null;

    const sources: any[] = [lastHandover, data].filter(Boolean);
    for (const src of sources) {
        const direct = asEmail(src.receiverEmail) || asEmail(src.receiverSignature?.email) || asEmail(src.receiver);
        if (direct) return direct;
        const ids = [src.receiverId, src.receiverUid, src.receiverSignature?.uid];
        for (const id of ids) {
            const viaId = id ? directory.emailById.get(String(id)) : null;
            if (viaId) return viaId;
        }
        const names = [src.receiverName, src.receiver, src.receiverSignature?.name, src.closureReceiverName];
        for (const n of names) {
            console.log('Attempting to resolve email for receiver:', n);
            const viaName = byName(n);
            if (viaName) return viaName;
        }
    }
    return null;
};

// ============================================================================
// ✉️ HTML EMAIL TEMPLATES (Aggregated Daily & Weekly Reports)
// ============================================================================

const generateReceiverReminderHtml = (receiverName: string, permits: ExpiredPermitRecord[]): string => {
    const safeReceiverName = escapeHtml(receiverName);
    const count = permits.length;

    const permitRows = permits.map(p => {
        const overdueBadge = p.daysOverdue > 0
            ? `<span style="background-color: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">${p.daysOverdue}d overdue</span>`
            : `<span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Expires today</span>`;

        return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 14px; font-weight: 700; color: #047857; font-family: monospace; font-size: 14px;">
                    ${escapeHtml(p.permitRef)}
                </td>
                <td style="padding: 12px 14px; font-size: 13px; color: #334155;">
                    ${escapeHtml(p.permitType)}
                </td>
                <td style="padding: 12px 14px; font-size: 13px; color: #334155;">
                    ${escapeHtml(p.location)}
                </td>
                <td style="padding: 12px 14px; font-size: 13px; color: #b91c1c; font-weight: 600;">
                    ${escapeHtml(p.expiryDisplay)}
                    <div style="margin-top: 4px;">${overdueBadge}</div>
                </td>
                <td style="padding: 12px 14px; text-align: center;">
                    <a href="${p.url}" target="_blank" style="display: inline-block; background-color: #047857; color: #ffffff; text-decoration: none; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px;">
                        Close Permit &rarr;
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Receiver Reminder - Action Required</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7c2d12 0%, #b45309 100%); padding: 26px 24px; text-align: left; color: #ffffff;">
            <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 10px;">
                ⚠️ DAILY PERMIT CLOSURE NOTICE
            </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Action Required: Overdue Permit Closures</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Attention <strong>${safeReceiverName}</strong> &bull; ${count} active permit${count > 1 ? 's require' : ' requires'} immediate closure</p>
        </div>

        <!-- Body -->
        <div style="padding: 24px;">
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 4px; margin-bottom: 22px;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400e;">
                    <strong>Attention:</strong> The following active permit(s) for which you are the designated Receiver have reached or exceeded their expiry date. All physical site operations under these permits must cease immediately, and the permits must be formally closed and signed off in the digital register.
                </p>
            </div>

            <!-- Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                    <tr style="background-color: #e2e8f0; text-align: left;">
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Permit Ref</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Type</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Location</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Expiry Date</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; text-align: center;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${permitRows}
                </tbody>
            </table>

            <!-- Call to action button -->
            <div style="text-align: center; margin: 30px 0 20px 0;">
                <a href="https://eba-digital-permits.web.app" target="_blank" style="display: inline-block; background-color: #047857; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    🚀 Log In to Digital Permit Register &rarr;
                </a>
                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Please inspect the site, complete the digital closure sign-off, and attach any required reinstatement records.</p>
            </div>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Can You Dig It &bull; Eastern Busway Digital Permit Notification System
        </div>
    </div>
</body>
</html>
    `;
};

export const generateIssuerMasterReportHtml = (permits: ExpiredPermitRecord[], referenceDate: Date): string => {
    const reportDateStr = referenceDate.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const count = permits.length;

    const permitRows = permits.length === 0
        ? `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #047857; font-weight: 600;">✅ Excellent! Zero permits currently overdue for closure across the project.</td></tr>`
        : permits.map(p => {
            const overdueBadge = p.daysOverdue > 0
                ? `<span style="background-color: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">${p.daysOverdue}d overdue</span>`
                : `<span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Expires today</span>`;

            return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 12px; font-weight: 700; color: #047857; font-family: monospace; font-size: 13px;">
                        <a href="${p.url}" target="_blank" style="color: #047857; text-decoration: underline;">
                            ${escapeHtml(p.permitRef)}
                        </a>
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #334155;">
                        ${escapeHtml(p.permitType)}
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #334155;">
                        ${escapeHtml(p.location)}
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #1e293b;">
                        <div><strong>${escapeHtml(p.receiverName)}</strong></div>
                        <div style="font-size: 11px; color: #64748b;">${escapeHtml(p.receiverEmail)}</div>
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #1e293b;">
                        <div>${escapeHtml(p.issuerName)}</div>
                        <div style="font-size: 11px; color: #64748b;">${escapeHtml(p.issuerEmail)}</div>
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #b91c1c; font-weight: 600;">
                        ${escapeHtml(p.expiryDisplay)}
                        <div style="margin-top: 2px;">${overdueBadge}</div>
                    </td>
                </tr>
            `;
        }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Issuer Master Audit - Pending Permit Closures</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <div style="max-width: 860px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 24px; text-align: left; color: #ffffff;">
            <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 10px;">
                📋 WEEKLY ISSUER MASTER AUDIT
            </div>
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Eastern Busway Permit Closure Audit</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.85;">Project-wide audit report generated on <strong>${reportDateStr}</strong></p>
        </div>

        <!-- Summary Statistics -->
        <div style="padding: 24px;">
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="flex: 1; background-color: ${count > 0 ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${count > 0 ? '#fecaca' : '#bbf7d0'}; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: ${count > 0 ? '#991b1b' : '#166534'};">Total Pending Closures</div>
                    <div style="font-size: 32px; font-weight: 800; color: ${count > 0 ? '#b91c1c' : '#15803d'}; margin-top: 4px;">${count}</div>
                </div>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #334155; margin-top: 0; margin-bottom: 16px;">
                This executive weekly audit summarizes all permits currently marked as active that have passed their scheduled validity window. Issuers are requested to follow up with the designated receivers or execute an issuer-level closure if work is concluded.
            </p>

            <!-- Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                    <tr style="background-color: #e2e8f0; text-align: left;">
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Permit Ref</th>
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Type</th>
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Location</th>
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Receiver</th>
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Issuer</th>
                        <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Expiry Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${permitRows}
                </tbody>
            </table>

            <!-- Call to action button -->
            <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="https://eba-digital-permits.web.app" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    Access Master Permit Dashboard &rarr;
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Can You Dig It &bull; Master Configuration &amp; Audit System &bull; Eastern Busway Alliance
        </div>
    </div>
</body>
</html>
    `;
};

// ============================================================================
// ⏰ CLOUD FUNCTIONS v2 SCHEDULED CRON JOBS
// ============================================================================

interface ExpiredScanResult {
    byReceiver: Map<string, ExpiredPermitRecord[]>;
    unresolved: ExpiredPermitRecord[];
    total: number;
}

/**
 * Scans LIVE issued permits (isDraft === false) that are past expiry and not closed,
 * grouped by receiver email. Permits with no resolvable receiver are returned separately.
 */
const collectExpiredPermits = async (now: Date): Promise<ExpiredScanResult> => {
    const directory = await buildUserEmailDirectory();
    // Status values vary in the DB ('issued' / 'active'); isDraft === false is the authoritative issued flag.
    const snapshot = await db.collection('permits').where('isDraft', '==', false).get();
    console.log(`[Expired Scan] permits where isDraft == false: ${snapshot.size} documents.`);

    const byReceiver = new Map<string, ExpiredPermitRecord[]>();
    const unresolved: ExpiredPermitRecord[] = [];
    let total = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.status === 'closed' || data.isClosed === true) continue;

        const expiryInfo = parsePermitExpiry(data, now, doc.id);
        if (!expiryInfo.isExpired) continue;

        const receiverEmail = resolveReceiverEmail(data, directory) || '';
        const record: ExpiredPermitRecord = {
            id: doc.id,
            permitRef: formatPermitRef(data, doc.id),
            permitType: getPermitTypeLabel(data),
            location: data.location || data.areaDescription || data.dewateringLocation || 'Location not specified',
            expiryDisplay: expiryInfo.expiryDisplay,
            daysOverdue: expiryInfo.daysOverdue,
            receiverEmail,
            receiverName: data.receiverSignature?.name || data.receiverName || data.receiver || (receiverEmail ? getDisplayNameFromEmail(receiverEmail) : '') || 'Permit Receiver',
            issuerEmail: data.issuerEmail || data.issuerSignature?.email || '',
            issuerName: data.issuerSignature?.name || data.issuerName || 'Permit Issuer',
            url: `https://eba-digital-permits.web.app/#/permit/${doc.id}`
        };
        total++;

        if (!receiverEmail) {
            unresolved.push(record);
            continue;
        }
        const list = byReceiver.get(receiverEmail) || [];
        list.push(record);
        byReceiver.set(receiverEmail, list);
    }

    console.log(`[Expired Scan] ${total} expired, ${byReceiver.size} receivers, ${unresolved.length} unresolved.`);
    return { byReceiver, unresolved, total };
};

/**
 * 1. Receiver Weekend Wrap-Up
 * Runs every Friday at 16:00 (Pacific/Auckland).
 * Queries active, non-draft permits whose expiry date has passed, groups them by receiver,
 * and sends ONE aggregated email per receiver asking them to close the permits before the weekend.
 */
export const receiverWeekendWrapUp = onSchedule(
    {
        schedule: 'every friday 16:00',
        timeZone: 'Pacific/Auckland',
        memory: '512MiB',
        timeoutSeconds: 120,
        secrets: [RESEND_API_KEY]
    },
    async () => {
        console.log(`[Scheduled: Daily Receiver Reminders] 🕒 Execution started at ${new Date().toISOString()}`);

        const now = new Date();
        const resendLoaded = Boolean(RESEND_API_KEY.value());
        console.log(`[Mail Secrets] RESEND_API_KEY loaded: ${resendLoaded}`);
        if (!resendLoaded) {
            console.error('[Daily Receiver Reminders] ❌ RESEND_API_KEY not configured. Run: firebase functions:secrets:set RESEND_API_KEY. Aborting.');
            return;
        }

        const { byReceiver: expiredByReceiver, unresolved } = await collectExpiredPermits(now);
        if (unresolved.length > 0) {
            console.warn(`[Daily Receiver Reminders] ⚠️ ${unresolved.length} expired permit(s) have no resolvable receiver email (included in the master report only).`);
        }

        const COPY_EMAIL = 'dietrich.truchsess@easternbusway.nz';

        for (const [receiverEmail, permitsList] of expiredByReceiver.entries()) {
            try {
                console.log(`Attempting to send email to ${receiverEmail} with ${permitsList.length} permits, CCing Dietrich...`);
                const receiverName = permitsList[0]?.receiverName || 'Permit Receiver';
                const htmlContent = generateReceiverReminderHtml(receiverName, permitsList);

                await sendEmail({
                    to: receiverEmail,
                    cc: COPY_EMAIL,
                    subject: `⚠️ Weekend Wrap-Up: You have ${permitsList.length} permit${permitsList.length > 1 ? 's' : ''} requiring closure before the weekend`,
                    html: htmlContent
                });

                console.log(`[Daily Receiver Reminders] ✅ Sent reminder to ${receiverEmail} for ${permitsList.length} permit(s).`);
            } catch (err: any) {
                console.error(`[Daily Receiver Reminders] ❌ Failed sending reminder to ${receiverEmail}:`, err?.message || err);
            }
        }

        console.log('[Daily Receiver Reminders] 🏁 Completed daily reminder run.');
    }
);

/**
 * 2. Issuer Weekly Digest (Management Summary)
 * Runs every Monday 06:30 (Pacific/Auckland). Lists active permits overdue by 7+ days.
 * Sent only to the Chief Architect.
 */
export const issuerWeeklyDigest = onSchedule(
    {
        schedule: '30 6 * * 1',
        timeZone: 'Pacific/Auckland',
        memory: '512MiB',
        timeoutSeconds: 120,
        secrets: [RESEND_API_KEY]
    },
    async () => {
        const TAG = '[Weekly Boss Report]';
        const BOSS_EMAIL = 'dietrich.truchsess@easternbusway.nz';
        const now = new Date();

        if (!RESEND_API_KEY.value()) {
            console.error(`${TAG} ❌ RESEND_API_KEY not configured. Aborting.`);
            return;
        }

        const { byReceiver, unresolved, total } = await collectExpiredPermits(now);
        const groups = [...byReceiver.entries()]
            .map(([email, permits]) => ({
                label: `${permits[0]?.receiverName || getDisplayNameFromEmail(email)} (${email})`,
                permits: [...permits].sort((a, b) => b.daysOverdue - a.daysOverdue)
            }))
            .sort((a, b) => b.permits.length - a.permits.length || a.label.localeCompare(b.label));
        if (unresolved.length > 0) {
            groups.push({ label: 'Unassigned / receiver email not found', permits: unresolved });
        }

        const cell = 'padding:8px;border:1px solid #ddd;';
        const sections = groups.map(g => `
            <h3 style="margin:24px 0 8px;">${escapeHtml(g.label)} &mdash; ${g.permits.length} permit${g.permits.length === 1 ? '' : 's'}</h3>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
                <thead><tr style="background:#f3f4f6;text-align:left;">
                    <th style="${cell}">Permit Ref</th><th style="${cell}">Type</th><th style="${cell}">Location</th>
                    <th style="${cell}">Expired</th><th style="${cell}">Days Overdue</th>
                </tr></thead>
                <tbody>${g.permits.map(p => `<tr>
                    <td style="${cell}"><a href="${p.url}">${escapeHtml(p.permitRef)}</a></td>
                    <td style="${cell}">${escapeHtml(p.permitType)}</td>
                    <td style="${cell}">${escapeHtml(p.location)}</td>
                    <td style="${cell}">${escapeHtml(p.expiryDisplay)}</td>
                    <td style="${cell}text-align:center;color:#b91c1c;font-weight:bold;">${p.daysOverdue}</td>
                </tr>`).join('')}</tbody>
            </table>`).join('');

        const html = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:auto;">
            <h2>Weekly Management Summary: Expired Permits</h2>
            <p>${total} expired permit(s) not yet closed, across ${byReceiver.size} receiver(s)${unresolved.length ? ` plus ${unresolved.length} with no resolvable receiver` : ''}.</p>
            ${total === 0 ? '<p>No expired permits are awaiting closure.</p>' : sections}
        </div>`;

        try {
            await sendEmail({
                to: BOSS_EMAIL,
                subject: `📋 Weekly Management Summary: ${total} Expired Permit${total === 1 ? '' : 's'} Awaiting Closure`,
                html
            });
            console.log(`${TAG} ✅ Report sent to ${BOSS_EMAIL}.`);
        } catch (err: any) {
            console.error(`${TAG} ❌ Failed to send report:`, err?.message || err);
        }
    }
);

export const cxIncomingWebhook = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ success: true }); }); });
export const emergencyCleanup = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ message: "Disabled" }); }); });
export const cxGetByReference = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxIssuePermit = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxChangeStatus = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxUploadAttachment = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });