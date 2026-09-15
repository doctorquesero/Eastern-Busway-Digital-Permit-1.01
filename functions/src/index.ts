// ARCHIVO: functions/src/index.ts
import * as functions from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
require("dotenv").config();
const corsHandler = require("cors")({ origin: true });
const nodemailer = require('nodemailer');

const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const CX_API_BASE = "https://au.itwocx.com/api/26.08";

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
    'environmental': { allowed: true, pdfPrefix: 'Environmental' }
};

const getGlobalCXSession = async (projectCode: string) => {
    try {
        const cxDoc = await db.collection('settings').doc('cx_auth').get();
        if (cxDoc.exists) {
            const data = cxDoc.data();
            if (projectCode.toUpperCase().includes('DEMO') && data?.demo_session_key) {
                return data.demo_session_key;
            }
            if (data?.session_key) {
                return data.session_key;
            }
        }
        return process.env.CX_MASTER_TOKEN || process.env.VITE_CX_MASTER_TOKEN || null;
    } catch (err) {
        return null;
    }
};

const getBaseOptions = (sessionKey: string, method: string = "GET") => {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    if (sessionKey) {
        headers["UserToken"] = sessionKey;
        headers["Authorization"] = `Bearer ${sessionKey}`;
    }
    return { method, headers };
};

const safeParseJSON = async (response: Response, step: string) => {
    const text = await response.text();
    const trimmedText = text.trim().toLowerCase();
    if (response.status === 403 || trimmedText.startsWith('<html') || trimmedText.startsWith('<!doctype html')) {
        throw new Error('Session Token expired/rejected (403 HTML).');
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`[${step}] iTwoCX returned HTML instead of JSON. Fragment: ${text.substring(0, 100)}...`);
    }
};

const cacheCXSession = async (projectCode: string, sessionKey: string) => {
    const authPayload: any = { updatedAt: new Date().toISOString() };
    if (projectCode.toUpperCase().includes('DEMO')) {
        authPayload.demo_session_key = sessionKey;
    } else {
        authPayload.session_key = sessionKey;
    }
    await db.collection('settings').doc('cx_auth').set(authPayload, { merge: true });
};

const clearCXSession = async () => {
    await db.collection('settings').doc('cx_auth').delete();
};

export const performCXLogin = async (email?: string, password?: string): Promise<any> => {
    const targetEmail = email || process.env.CX_MASTER_EMAIL;
    const targetPassword = password || process.env.CX_MASTER_PASSWORD;
    const configuredToken = process.env.CX_MASTER_TOKEN || process.env.VITE_CX_MASTER_TOKEN;

    if (targetEmail && targetPassword) {
        const loginRes = await fetch(`${CX_API_BASE}/Api/Login/ByEmail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ Email: targetEmail, Password: targetPassword })
        });
        const loginData = await safeParseJSON(loginRes, 'v26.08 Login');
        const sessionKey = loginData?.SessionKey || loginData?.sessionKey || loginData?.AccessToken || loginData?.accessToken || loginData?.Token || loginData?.token || loginData?.Key || loginData?.key;
        if (loginRes.ok && sessionKey) return { ...loginData, Key: sessionKey };
        const errors = loginData?.ErrorMessages?.join(', ') || loginData?.Message || `HTTP ${loginRes.status}`;
        throw new Error(`iTwoCX v26.08 login rejected: ${errors}`);
    }

    if (configuredToken) return { IsSuccess: true, Key: configuredToken };
    throw new Error('Missing CX_MASTER_TOKEN or CX_MASTER_EMAIL/CX_MASTER_PASSWORD for iTwoCX v26.08 authentication.');
};

const refreshCXSession = async (projectCode: string) => {
    const loginData = await performCXLogin();
    const sessionKey = loginData?.SessionKey || loginData?.sessionKey || loginData?.AccessToken || loginData?.accessToken || loginData?.Token || loginData?.token || loginData?.Key || loginData?.key;
    if (!sessionKey) throw new Error('Authentication failure: v26.08 login returned no session token.');
    await cacheCXSession(projectCode, sessionKey);
    return sessionKey as string;
};

// ============================================================================
// ASYNC PERMIT SYNC WORKER
// ============================================================================
const processPendingPermitSync = async (
    permitId: string,
    newValue: any,
    previousValue: any,
    collectionName: string
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

        // Rule 1.C: the project code belongs only in the URL path; the query value is PF# plus digits.
        const cleanNumber = String(permitNumber).replace(/\D/g, "");
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

        const getUrl = `${CX_API_BASE}/Api/${targetProjectCode}/Document/GetByDocCode?code=${encodeURIComponent('PF#' + paddedNumber)}`;

        let sessionKey = await getGlobalCXSession(targetProjectCode);

        if (!sessionKey) {
            console.log(`[CX Sync] Session Key missing. Performing background login for ${targetProjectCode}...`);
            sessionKey = await refreshCXSession(targetProjectCode);
        }

        let cxRawResponse: any;
        let refreshedAfterExpiry = false;
        for (let getAttempt = 0; getAttempt < 2; getAttempt++) {
            const getRes = await fetch(getUrl, getBaseOptions(sessionKey as string, "GET"));
            const responseText = await getRes.text();
            const trimmedResponse = responseText.trim().toLowerCase();
            const isHtmlResponse = trimmedResponse.startsWith('<html') || trimmedResponse.startsWith('<!doctype html');
            const isRejectedResponse = getRes.status === 403 || isHtmlResponse;
            if (isRejectedResponse) {
                if (!refreshedAfterExpiry) {
                    console.warn(`[CX Sync] Session token rejected for ${targetProjectCode}. Refreshing and retrying GET once.`);
                    await clearCXSession();
                    sessionKey = await refreshCXSession(targetProjectCode);
                    refreshedAfterExpiry = true;
                    continue;
                }
                throw new Error('Session Token expired/rejected (403 HTML).');
            }
            let parsedResponse: any;
            try {
                parsedResponse = JSON.parse(responseText);
            } catch (parseError) {
                const looksExpired = getRes.status === 401 || /expired|unauthorized|invalid token|session/i.test(responseText);
                if (!refreshedAfterExpiry && looksExpired) {
                    console.warn(`[CX Sync] Token expired for ${targetProjectCode}. Refreshing and retrying GET once.`);
                    await clearCXSession();
                    sessionKey = await refreshCXSession(targetProjectCode);
                    refreshedAfterExpiry = true;
                    continue;
                }
                throw new Error(`[GET for Async ${action}] iTwoCX returned non-JSON response (${getRes.status}). Fragment: ${responseText.substring(0, 100)}...`);
            }

            const responseMessage = JSON.stringify(parsedResponse);
            const looksExpired = getRes.status === 401 || /expired|unauthorized|invalid token|session/i.test(responseMessage);
            if (!refreshedAfterExpiry && looksExpired) {
                console.warn(`[CX Sync] Token expired for ${targetProjectCode}. Refreshing and retrying GET once.`);
                await clearCXSession();
                sessionKey = await refreshCXSession(targetProjectCode);
                refreshedAfterExpiry = true;
                continue;
            }

            if (!getRes.ok) {
                throw new Error(`GET for Async ${action} failed with HTTP ${getRes.status}: ${responseText.substring(0, 200)}`);
            }
            cxRawResponse = parsedResponse;
            break;
        }

        // GetByDocCode returns a paged response; only its first item is the document model.
        const cxDoc: any = Array.isArray(cxRawResponse?.Items) ? cxRawResponse.Items[0] : undefined;

        const permitRef = `PF#${paddedNumber}`;

        if (!cxDoc || typeof cxDoc !== 'object') {
            throw new Error(`GET SUCCESS but 0 ITEMS FOUND. Searched URL: /Api/${targetProjectCode}/Document/GetByDocCode?code=${encodeURIComponent(exactCXReference)}`);
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

                const uploadOptions: any = getBaseOptions(sessionKey as string, "POST");
                uploadOptions.body = JSON.stringify(uploadPayload);

                const uploadRes = await fetch(uploadUrl, uploadOptions);
                const uploadData = await safeParseJSON(uploadRes, `POST Attachment`);

                if (uploadData && uploadData.IsSuccess === false) {
                    console.warn(`[DLQ] CX Attachment Upload Warning:`, uploadData.ErrorMessages);
                } else {
                    console.log(`[DLQ] ✅ Successfully uploaded PDF to CX for ${permitRef}`);
                }
            } catch (pdfErr: any) {
                console.error("[DLQ] Failed to upload PDF to CX:", pdfErr.message);
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
            sync_status: 'synced', syncStatus: 'synced', cxSyncPending: null, cxSyncError: null, sync_error: null, lastSyncedAt: new Date().toISOString()
        });

        console.log(`[CX Sync] ✅ Successfully executed ${action} for ${permitRef}`);

    } catch (error: any) {
        const nativeError = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        const errorString = `CX API Error: ${nativeError}`;

        await db.collection(collectionName).doc(permitId).update({
            syncStatus: 'failed',
            cxSyncError: errorString,
            sync_error: errorString
        });

        throw new Error(errorString);
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

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: 'EBApermits@gmail.com', pass: 'iuxn tjhm cixw byas' }
        });
        const ALERT_EMAILS = 'dietrich.is.coding@gmail.com, dietrich.is.coding@gmail.com';

        const notifyOptions = {
            from: '"Can You Dig It - Safety Bot" <EBApermits@gmail.com>',
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
        try { await transporter.sendMail(notifyOptions); } catch (error) { }
    }
};

export const onPermitWritten = onDocumentWritten('permits/{permitId}', async (event: any) => {
    if (!event.data || !event.data.after || !event.data.after.exists) return;
    const newValue = event.data.after.data();
    const previousValue = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    await processPendingPermitSync(event.params.permitId, newValue, previousValue, 'permits');
});

export const onDemoPermitWritten = onDocumentWritten('permits_demo/{permitId}', async (event: any) => {
    if (!event.data || !event.data.after || !event.data.after.exists) return;
    const newValue = event.data.after.data();
    const previousValue = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    await processPendingPermitSync(event.params.permitId, newValue, previousValue, 'permits_demo');
});

export const cxIncomingWebhook = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ success: true }); }); });
export const emergencyCleanup = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ message: "Disabled" }); }); });
export const cxLogin = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxGetByReference = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxIssuePermit = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxChangeStatus = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });
export const cxUploadAttachment = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "LOBOTOMISED" }); }); });