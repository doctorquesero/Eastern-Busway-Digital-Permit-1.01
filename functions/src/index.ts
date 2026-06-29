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

const CX_API_BASE = "https://au.itwocx.com/api/25.12/Api";

// ============================================================================
// 📊 TABLA DE CONFIGURACIÓN MODULAR DE PERMISOS (Diccionario CX)
// ============================================================================
interface PermitTypeSettings {
    allowed: boolean;
    pdfPrefix: string;
}

const PERMIT_CONFIG: Record<string, PermitTypeSettings> = {
    // Breaking Ground & Excavations
    "BG": { allowed: true, pdfPrefix: "BG" },           // Breaking Ground Permit
    "BGP": { allowed: true, pdfPrefix: "BGP" },         // Breaking Ground Permit PART B
    "BE": { allowed: true, pdfPrefix: "BE" },           // Breaking Ground Service Disconnection
    "EXCAVATION": { allowed: true, pdfPrefix: "BG" },   // Generic fallback for our app
    "HYDRO": { allowed: true, pdfPrefix: "HYDRO" },     // Hydro Excavation
    "TES": { allowed: true, pdfPrefix: "TES" },         // Trench Excavation Safe Entry
    
    // High Risk & Specialized
    "CS": { allowed: true, pdfPrefix: "CS" },           // Confined Space Entry
    "HO": { allowed: true, pdfPrefix: "HO" },           // Hot Works
    "HP": { allowed: true, pdfPrefix: "HP" },           // High-Powered Hand Saw
    "ISO": { allowed: true, pdfPrefix: "ISO" },         // Isolation
    "OOH": { allowed: true, pdfPrefix: "OOH" },         // Out of Hours
    "PT": { allowed: true, pdfPrefix: "PT" },           // Permit to Test
    "PUMP": { allowed: true, pdfPrefix: "PUMP" },       // Permit to Pump
    "USW1": { allowed: true, pdfPrefix: "USW1" },       // Utility Services L1
    "USW2": { allowed: true, pdfPrefix: "USW2" },       // Utility Services L2
    "WB": { allowed: true, pdfPrefix: "WB" },           // Workbox
    "WH": { allowed: true, pdfPrefix: "WH" }            // Working at Heights
};

const getBaseOptions = (sessionKey: string, method: string) => {
    const headers: any = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    if (sessionKey) {
        headers["Key"] = sessionKey;
    }
    return { method, headers };
};

const formatRef = (ref: string) => {
    const cleanRef = String(ref).replace(/\D/g, '');
    const paddedRef = cleanRef.padStart(4, '0');
    return `PF%23${paddedRef}`;
};

const safeParseJSON = async (response: Response, step: string) => {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`[${step}] HTTP ${response.status}: ${text.substring(0, 200)}`);
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`[${step}] iTwoCX devolvió HTML. Fragmento: ${text.substring(0, 100)}...`);
    }
};

const performCXLogin = async (email?: string, password?: string): Promise<any> => {
    const targetEmail = email || process.env.CX_MASTER_EMAIL;
    const targetPassword = password || process.env.CX_MASTER_PASSWORD;

    if (!targetEmail || !targetPassword) {
        throw new Error("Missing email or password for CX login.");
    }

    let encryptedString = "";
    try {
        const encryptRes = await fetch(`${CX_API_BASE}/Login/EncryptPassword`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Password: targetPassword })
        });
        const rawRes = await encryptRes.text();
        if (!encryptRes.ok) throw new Error(`HTTP ${encryptRes.status}: ${rawRes.substring(0, 150)}`);
        encryptedString = rawRes.replace(/^"|"$/g, '');
    } catch (e: any) { throw new Error(`Step 1 Failed: ${e.message}`); }

    let loginRes: Response;
    try {
        loginRes = await fetch(`${CX_API_BASE}/Login/ByEmail`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Email: targetEmail, EncryptedPassword: encryptedString })
        });
    } catch (e: any) { throw new Error(`Step 2 Failed: ${e.message}`); }

    const loginData = await safeParseJSON(loginRes, "POST Login ByEmail");
    if (loginData && loginData.IsSuccess !== false && (loginData.Key || loginData.SessionKey)) {
        return loginData;
    }
    throw new Error(`Step 2 Rejected.`);
};

// ============================================================================
// 🛑 LOBOTOMÍA HTTP
// ============================================================================
export const cxGetByReference = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "Blocked." }); }); });
export const cxIssuePermit = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "Blocked." }); }); });
export const cxChangeStatus = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "Blocked." }); }); });
export const cxUploadAttachment = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "Blocked." }); }); });
export const cxLogin = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(403).send({ error: "Blocked." }); }); });

// ============================================================================
// 📧 BACKGROUND WORKER (DLQ)
// ============================================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'EBApermits@gmail.com', pass: 'umuymnsyxqnnmshz' }
});
const ALERT_EMAILS = 'dietrichtruchsess@gmail.com, dietrich.truchsess@easternbusway.nz';

const processPendingPermitSync = async (permitId: string, newValue: any, previousValue: any) => {
    const permitNumber = newValue.itwocxNumber || newValue.permitNumber || permitId;
    
    // 🚀 EXTRACCIÓN DINÁMICA DEL TIPO DE PERMISO
    const rawType = (newValue.permitType || "EXCAVATION").toUpperCase();
    const typeConfig = PERMIT_CONFIG[rawType] || { allowed: true, pdfPrefix: "PF" };

    if (newValue.sync_status === 'pending' || newValue.syncStatus === 'pending') {
        const action = newValue.cxSyncPending === 'closure' ? 'Closure' : 'Issuance';
        const userInField = newValue.cxSyncPending === 'closure' ? newValue.closureReceiverName : newValue.issuerSignature?.name;
        
        try {
            if (!process.env.CX_MASTER_EMAIL || !process.env.CX_MASTER_PASSWORD) throw new Error("Missing master credentials.");
            const loginData = await performCXLogin();
            const sessionKey = loginData.Key || loginData.SessionKey;
            if (!sessionKey) throw new Error("Auto-login failed.");

            const configDoc = await db.collection("settings").doc("config").get();
            const configData = configDoc.exists ? configDoc.data() : {};
            const isDemoMode = configData?.environment === 'demo_mode' || configData?.acceptLiveTraffic === false || newValue.environment === 'demo' || String(newValue.projectCode || '').toUpperCase().includes('DEMO');
            const targetProjectCode = isDemoMode ? 'EB-DEMO' : 'EB';
            
            // 1. OBTENER ID INTERNO Y DOCUMENTO COMPLETO
            const getUrl = `${CX_API_BASE}/${targetProjectCode}/Document/GetByReference?reference=${formatRef(permitNumber as string)}`;
            const getRes = await fetch(getUrl, getBaseOptions(sessionKey as string, "GET"));
            const cxDoc: any = await safeParseJSON(getRes, `GET for Async ${action}`);
            if (!cxDoc || !cxDoc.Id) throw new Error("Invalid document received from CX");

            // 🚀 SONAR PING: Imprimir en consola qué acciones permite este documento actualmente
            console.log(`[SONAR] CX DOC DATA FOR PF#${permitNumber} [TYPE: ${rawType}]:`, JSON.stringify({
                StatusName: cxDoc.StatusName,
                ActionCodes: cxDoc.ActionCodes || "N/A",
                Actions: cxDoc.Actions || "N/A",
                Transitions: cxDoc.Transitions || "N/A"
            }));

            // 2. 🚀 INYECTAR PDF SI ES CIERRE
            if (action === 'Closure' && newValue.pdfBackupUrl) {
                try {
                    console.log(`[DLQ] Downloading PDF from Firebase to upload to CX...`);
                    const pdfRes = await fetch(newValue.pdfBackupUrl);
                    const arrayBuffer = await pdfRes.arrayBuffer();
                    const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

                    const uploadUrl = `${CX_API_BASE}/${targetProjectCode}/Attachment/Upload?documentId=${cxDoc.Id}`;
                    
                    // 🚀 NOMBRAMIENTO DINÁMICO DEL PDF USANDO EL DICCIONARIO
                    const uploadPayload = {
                        Name: `${typeConfig.pdfPrefix}_${permitNumber}_Closed.pdf`,
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
                        console.log(`[DLQ] ✅ Successfully uploaded PDF to CX for PF#${permitNumber}`);
                    }
                } catch (pdfErr: any) {
                    console.error("[DLQ] Failed to upload PDF to CX:", pdfErr.message);
                }
            }

            // 3. 🚀 UPDATE COMPLETO CON LA PALABRA MÁGICA REVELADA
            const updateUrl = `${CX_API_BASE}/${targetProjectCode}/Document/Update`;
            const options: any = getBaseOptions(sessionKey as string, "PUT");
            
            const updatePayload: any = { ...cxDoc };

            if (action === 'Issuance') {
                updatePayload.StatusName = "PERMIT ISSUED";
                updatePayload.ActionCodes = ["ISSUE"];
            } else {
                updatePayload.StatusName = "CLOSED"; // <--- AQUÍ ESTÁ EL CAMBIO CRÍTICO
                updatePayload.ActionCodes = ["CLOSE"];
            }
            
            options.body = JSON.stringify(updatePayload);

            const updateRes = await fetch(updateUrl, options);
            const updateData = await safeParseJSON(updateRes, `PUT for Async ${action}`);

            // 🚀 SONAR PING: Ver qué respondió realmente iTwoCX a nuestra solicitud de cambio
            console.log(`[SONAR] UPDATE RESPONSE FROM iTwoCX:`, JSON.stringify(updateData));

            if (updateData && updateData.IsSuccess === false) {
                const errorMessage = updateData.ErrorMessages?.join(', ') || `API rejected.`;
                throw new Error(errorMessage);
            }

            // ÉXITO
            await db.collection('permits').doc(permitId).update({
                sync_status: 'synced', syncStatus: 'synced', cxSyncPending: null, cxSyncError: null, sync_error: null, lastSyncedAt: new Date().toISOString()
            });

        } catch (error: any) {
            console.error(`[DLQ Worker] Sync failed:`, error.message);
            const errorMessage = error.message || 'Unknown Error';

            await db.collection('permits').doc(permitId).update({ 
                sync_status: 'failed', syncStatus: 'failed', sync_error: errorMessage, cxSyncError: errorMessage, failedAt: new Date().toISOString()
            });

            const mailAttachments: any[] = [];
            if (newValue.pdfBackupUrl) mailAttachments.push({ filename: `PF${permitNumber}_Backup.pdf`, path: newValue.pdfBackupUrl });

            const mailOptions = {
                from: '"Can you dig it - System" <EBApermits@gmail.com>',
                to: ALERT_EMAILS,
                subject: `🚨 ACTION REQUIRED: CX Sync Failed on PF#${permitNumber}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px;">
                        <h2 style="color:red; margin-top:0;">Falla de sincronización con iTwoCX</h2>
                        <p><strong>Permiso Tipo:</strong> ${rawType}</p>
                        <p><strong>Acción:</strong> ${action}</p>
                        <p><strong>Usuario en Campo:</strong> ${userInField || 'Desconocido'}</p>
                        <p><strong>Error arrojado por CX:</strong> ${errorMessage}</p>
                    </div>
                `,
                attachments: mailAttachments
            };
            try { await transporter.sendMail(mailOptions); } catch (e) {}
        }
    }

    // 👷‍♂️ LÓGICA AVISO APPROVER MECÁNICA (Intacta)
    const isNowIssued = newValue.status === 'issued' && previousValue.status !== 'issued';
    const isMechanical = newValue.excavationType === 'mechanical';
    const needsApprover = !newValue.approverSignature?.data;

    if (isNowIssued && isMechanical && needsApprover) {
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

        const notifyOptions = {
            from: '"Can you dig it - Safety Bot" <EBApermits@gmail.com>',
            to: approverEmailsList,
            cc: ALERT_EMAILS,
            subject: `⚠️ ACTION REQUIRED: Part B Approval Pending - PF#${permitNumber}`,
            html: `<p>Se requiere aprobación para excavación mecánica. Permiso PF#${permitNumber}.</p>
                   <p>Ingeniero a cargo: <b>${engineerName}</b> (${engineerEmail})</p>`
        };

        try { await transporter.sendMail(notifyOptions); } catch (error) {}
    }
};

export const onPermitWritten = onDocumentWritten('permits/{permitId}', async (event: any) => {
    if (!event.data || !event.data.after || !event.data.after.exists) return;
    const newValue = event.data.after.data();
    const previousValue = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    await processPendingPermitSync(event.params.permitId, newValue, previousValue);
});

export const cxIncomingWebhook = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ success: true }); }); });
export const emergencyCleanup = functions.https.onRequest((req: any, res: any) => { corsHandler(req, res, async () => { res.status(200).send({ message: "Desactivado" }); }); });