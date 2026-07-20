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

const CX_API_BASE = "https://au.itwocx.com/api/25.12";

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
        return null;
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

export const performCXLogin = async (email?: string, password?: string): Promise<any> => {
    const targetEmail = email || process.env.CX_MASTER_EMAIL;
    const targetPassword = password || process.env.CX_MASTER_PASSWORD;

    if (!targetEmail || !targetPassword) {
        throw new Error("Missing email or password for CX login.");
    }

    let encryptedString = "";
    try {
        const encryptRes = await fetch(`${CX_API_BASE}/Api/Login/EncryptPassword`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Password: targetPassword })
        });
        const rawRes = await encryptRes.text();
        if (!encryptRes.ok) throw new Error(`HTTP ${encryptRes.status}: ${rawRes.substring(0, 150)}`);
        encryptedString = rawRes.replace(/^"|"$/g, '');
    } catch (e: any) { throw new Error(`Step 1 Failed: ${e.message}`); }

    let loginRes: Response;
    try {
        loginRes = await fetch(`${CX_API_BASE}/Api/Login/ByEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Email: targetEmail, EncryptedPassword: encryptedString })
        });
        const rawLogin = await loginRes.text();
        
        let jsonRes;
        try { jsonRes = JSON.parse(rawLogin); }
        catch (e) { throw new Error(`iTwoCX returned HTML on Login. Wait 30s. Fragment: ${rawLogin.substring(0,100)}...`); }

        if (!loginRes.ok) {
            const errs = jsonRes.ErrorMessages?.join(', ') || jsonRes.Message || "Unknown login error";
            throw new Error(`CX Login Rejected: ${errs}`);
        }
        
        return jsonRes;
    } catch (e: any) { throw new Error(`Step 2 Failed: ${e.message}`); }
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

        // ================================================================
        // 🚀 MATEMÁTICA DE RELLENO (PADDING FIX)
        // Extraemos los números y rellenamos con ceros hasta 4 dígitos
        // ej: 82 -> 0082, 605 -> 0605, 10582 -> 10582
        // ================================================================
        const cleanNumber = String(permitNumber).replace(/\D/g, "");
        const paddedNumber = cleanNumber.padStart(4, "0");
        const exactCXReference = `PF#${paddedNumber}`;

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
        
        const getUrl = `${CX_API_BASE}/Api/${targetProjectCode}/Document/GetByReference?reference=${encodeURIComponent(exactCXReference)}`;
        
        let sessionKey = await getGlobalCXSession(targetProjectCode);
        
        if (!sessionKey) {
            console.log(`[CX Sync] Session Key missing. Performing background login for ${targetProjectCode}...`);
            const loginData = await performCXLogin();
            
            const extractedKey = loginData?.SessionKey || loginData?.Key || loginData?.sessionKey || loginData?.key;
            
            if (extractedKey) {
                sessionKey = extractedKey;
                
                const authPayload: any = { updatedAt: new Date().toISOString() };
                if (targetProjectCode.includes('DEMO')) {
                    authPayload.demo_session_key = sessionKey;
                } else {
                    authPayload.session_key = sessionKey;
                }
                
                await db.collection('settings').doc('cx_auth').set(authPayload, { merge: true });
            } else {
                throw new Error(`Authentication failure: Could not map session key.`);
            }
        }
        
        const getRes = await fetch(getUrl, getBaseOptions(sessionKey as string, "GET"));
        
        // ================================================================
        // 🛡️ MODIFICACIÓN 1: MANEJO DEL TOKEN EXPIRADO (HTML INSTEAD OF JSON)
        // ================================================================
        let cxRawResponse: any;
        try {
            cxRawResponse = await safeParseJSON(getRes, `GET for Async ${action}`);
        } catch (parseError: any) {
            if (parseError.message.includes("returned HTML")) {
                console.warn(`[CX Sync] Token expired for ${targetProjectCode}. Deleting cached token.`);
                await db.collection('settings').doc('cx_auth').delete(); // Purga la llave vieja
                throw new Error("CX Session Token expired. Cleared auth cache. Please press RETRY SYNC again to generate a new token.");
            }
            throw parseError;
        }
        
        const cxDoc: any = cxRawResponse?.Document || cxRawResponse;

        const permitRef = targetProjectCode === 'EB-DEMO' ? `EB-DEMO-PF-${paddedNumber}` : `EB-PF-${paddedNumber}`;

        if (!cxDoc || !cxDoc.Id) {
            throw new Error(`Invalid document received from CX for ${permitRef}. The document may not exist, or the reference format is incorrect.`);
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
        
        // ================================================================
        // 📝 MODIFICACIÓN 2: REGISTRO HISTÓRICO DE CX (Inyección de nombre)
        // ================================================================
        const userInField = newValue.siteEngineerSignature?.name || newValue.createdBy || 'Unknown User';
        if (!updatePayload.Comments) {
            updatePayload.Comments = [];
        }
        updatePayload.Comments.push({
            Comment: `Status changed to ${updatePayload.StatusName} via Can You Dig It App by: ${userInField}`,
            IsInternal: false
        });

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
        const permitRef = targetProjectCode === 'EB-DEMO' ? `EB-DEMO-PF-${errorPadded}` : `EB-PF-${errorPadded}`;
        
        const isPendingRetry = newValue.syncStatus === 'pending' || newValue.sync_status === 'pending';
        
        if (!isPendingRetry) {
            const userInField = newValue.siteEngineerSignature?.name || newValue.createdBy || 'Unknown User';
            
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: 'EBApermits@gmail.com', pass: 'iuxn tjhm cixw byas' }
            });

            const mailAttachments: any[] = [];
            if (newValue.pdfBackupUrl) {
                mailAttachments.push({
                    filename: `Backup_${permitRef}.pdf`,
                    path: newValue.pdfBackupUrl,
                    contentType: 'application/pdf'
                });
            }

            const ALERT_EMAILS = 'dietrich.is.coding@gmail.com, dietrich.is.coding@gmail.com';
            
            const mailOptions = {
                from: '"Can You Dig It - Alerts" <EBApermits@gmail.com>',
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
            try { await transporter.sendMail(mailOptions); } catch (e) {}
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
        const permitRef = targetProjectCode === 'EB-DEMO' ? `EB-DEMO-PF-${notifPadded}` : `EB-PF-${notifPadded}`;

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
        try { await transporter.sendMail(notifyOptions); } catch (error) {}
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