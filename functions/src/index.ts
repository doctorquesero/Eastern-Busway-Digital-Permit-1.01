import * as functions from "firebase-functions";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
const corsHandler = require("cors")({ origin: true });
const nodemailer = require('nodemailer');

// 🚀 BASE URL CENTRALIZADA SEGÚN DOCUMENTACIÓN OFICIAL (VERSIÓN 25.12)
const CX_API_BASE = "https://au.itwocx.com/api/25.12/Api";

// 🛡️ HEADERS BÁSICOS ESTRICTOS (Sin Origin/Referer para evitar WebKnight)
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

// Limpieza de referencia y auto-relleno de ceros (ej. '18' -> 'PF#0018')
const formatRef = (ref: string) => {
    const cleanRef = String(ref).replace(/\D/g, '');
    const paddedRef = cleanRef.padStart(4, '0'); // 🚀 FIX: Auto-completa con ceros a 4 dígitos
    return `PF%23${paddedRef}`;
};

// Parseador seguro para evitar caídas si CX devuelve HTML
const safeParseJSON = async (response: Response, step: string) => {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`[${step}] HTTP ${response.status}: ${text.substring(0, 200)}`);
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : "HTML Desconocido";
        throw new Error(`[${step}] iTwoCX devolvió HTML en vez de datos JSON. Página: "${title}". Fragmento: ${text.substring(0, 100)}...`);
    }
};

// ============================================================================
// 📄 MÓDULO DE DOCUMENTOS (Basado estrictamente en Swagger Document)
// ============================================================================

export const cxGetByReference = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { projectCode, reference } = req.query;
            const sessionKey = req.headers['x-cx-session-key'] || req.query.sessionKey;

            if (!projectCode || !reference) return res.status(400).send({ error: "Missing projectCode or reference" });
            if (!sessionKey) return res.status(401).send({ error: "Unauthorized: Missing sessionKey." });

            const targetUrl = `${CX_API_BASE}/${projectCode}/Document/GetByReference?reference=${formatRef(reference as string)}`;

            const response = await fetch(targetUrl, getBaseOptions(sessionKey as string, "GET"));
            const data = await safeParseJSON(response, "GET Document");

            return res.status(200).send(data);
        } catch (error: any) {
            return res.status(500).send({ error: error.message || "Internal failure in cxGetByReference" });
        }
    });
});

export const cxIssuePermit = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { projectCode, reference } = req.query;
            const sessionKey = req.headers['x-cx-session-key'] || req.query.sessionKey;

            if (!projectCode || !reference) return res.status(400).send({ error: "Missing data" });
            if (!sessionKey) return res.status(401).send({ error: "Unauthorized: Missing sessionKey." });

            const getUrl = `${CX_API_BASE}/${projectCode}/Document/GetByReference?reference=${formatRef(reference as string)}`;
            const getRes = await fetch(getUrl, getBaseOptions(sessionKey as string, "GET"));
            const cxDoc: any = await safeParseJSON(getRes, "GET for Issue");

            if (!cxDoc || !cxDoc.Id) throw new Error(`Invalid document received from CX`);

            cxDoc.StatusName = "PERMIT ISSUED";

            const updateUrl = `${CX_API_BASE}/${projectCode}/Document/Update`;
            const options: any = getBaseOptions(sessionKey as string, "PUT");
            options.body = JSON.stringify(cxDoc);

            const updateRes = await fetch(updateUrl, options);
            const updateData = await safeParseJSON(updateRes, "PUT for Issue");

            if (updateData && updateData.IsSuccess === false) {
                const errorMessage = updateData.ErrorMessages?.join(', ') || 'Unknown internal CX error';
                throw new Error(`CX rejected the emission internally: ${errorMessage}`);
            }

            return res.status(200).send(updateData);
        } catch (error: any) {
            return res.status(500).send({ error: error.message || "Failure in cxIssuePermit" });
        }
    });
});

export const cxChangeStatus = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { projectCode } = req.query;
            const sessionKey = req.headers['x-cx-session-key'] || req.query.sessionKey;
            const payload = req.body; 

            if (!projectCode || !payload) return res.status(400).send({ error: "Missing data" });
            if (!sessionKey) return res.status(401).send({ error: "Unauthorized: Missing sessionKey." });

            const targetUrl = `${CX_API_BASE}/${projectCode}/Document/Update`;
            const options: any = getBaseOptions(sessionKey as string, "PUT");
            options.body = JSON.stringify(payload);

            const response = await fetch(targetUrl, options);
            const data = await safeParseJSON(response, "PUT for Change Status");

            if (data && data.IsSuccess === false) {
                const errorMessage = data.ErrorMessages?.join(', ') || 'Unknown internal CX error';
                throw new Error(`CX rejected the status change: ${errorMessage}`);
            }

            return res.status(200).send(data);
        } catch (error: any) {
            return res.status(500).send({ error: error.message || "Failure in cxChangeStatus" });
        }
    });
});

// ============================================================================
// 📎 MÓDULO DE ADJUNTOS (Basado estrictamente en Swagger Attachment Upload)
// ============================================================================

export const cxUploadAttachment = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const { projectCode, documentId } = req.query;
            const sessionKey = req.headers['x-cx-session-key'] || req.query.sessionKey;
            const payload = req.body; 

            if (!projectCode || !documentId || !payload || !payload.Content) {
                return res.status(400).send({ error: "Missing required data (projectCode, documentId, or Content)." });
            }
            if (!sessionKey) return res.status(401).send({ error: "Unauthorized: Missing sessionKey." });

            const targetUrl = `${CX_API_BASE}/${projectCode}/Attachment/Upload?documentId=${documentId}`;
            const options: any = getBaseOptions(sessionKey as string, "POST");
            options.body = JSON.stringify(payload);

            const response = await fetch(targetUrl, options);
            const data = await safeParseJSON(response, "POST Upload Attachment");

            if (data && data.IsSuccess === false) {
                const errorMessage = data.ErrorMessages?.join(', ') || 'Unknown internal CX error';
                throw new Error(`CX rejected the attachment: ${errorMessage}`);
            }

            return res.status(200).send(data);
        } catch (error: any) {
            return res.status(500).send({ error: error.message || "Failure in cxUploadAttachment" });
        }
    });
});

// ============================================================================
// 🔐 MÓDULO DE AUTENTICACIÓN (Basado estrictamente en Swagger Login)
// ============================================================================

export const cxLogin = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method !== 'POST') return res.status(405).send({ error: "Method Not Allowed" });

            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).send({ error: "Missing email or password." });
            }

            const encryptUrl = `${CX_API_BASE}/Login/EncryptPassword`;
            
            const encryptRes = await fetch(encryptUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ Password: password }) 
            });

            const encryptedPasswordRaw = await encryptRes.text();

            if (!encryptRes.ok) {
                throw new Error(`[Encrypt API] HTTP ${encryptRes.status}: ${encryptedPasswordRaw.substring(0, 100)}`);
            }

            const cleanEncryptedPassword = encryptedPasswordRaw.replace(/^"|"$/g, '');

            if (!cleanEncryptedPassword || cleanEncryptedPassword === "null") {
                 throw new Error(`[Encrypt API] Devuelve null o vacío. Revisa la contraseña.`);
            }

            const loginUrl = `${CX_API_BASE}/Login/ByEmail`;
            const loginPayload = {
                Email: email,
                EncryptedPassword: cleanEncryptedPassword
            };

            const loginRes = await fetch(loginUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(loginPayload)
            });

            const loginData = await safeParseJSON(loginRes, "POST Login ByEmail");

            if (loginData && loginData.IsSuccess === false) {
                const errorMessage = loginData.ErrorMessages?.join(', ') || 'Invalid credentials';
                return res.status(401).send({ error: errorMessage });
            }

            return res.status(200).send(loginData);

        } catch (error: any) {
            console.error("CX Login Error:", error);
            return res.status(500).send({ error: error.message || "Internal failure during CX login." });
        }
    });
});

// ============================================================================
// 📧 MÓDULO DE ALERTAS Y VIGÍA DE FIREBASE (CON AUTO-ADJUNTO DE PDF)
// ============================================================================

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'EBApermits@gmail.com',
        pass: 'umuymnsyxqnnmshz'
    }
});

// 🚀 LISTA DE DISTRIBUCIÓN (Fácil de cambiar para el próximo Document Controller)
const ALERT_EMAILS = 'dietrich.truchsess@easternbusway.nz'; 

export const notifyMasterOnSyncFailure = onDocumentUpdated('permits/{permitId}', async (event: any) => {
    if (!event.data) return;

    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    if (newValue.cxSyncPending && previousValue.cxSyncPending !== newValue.cxSyncPending) {
        const permitNumber = newValue.itwocxNumber || newValue.permitNumber || event.params.permitId;
        const action = newValue.cxSyncPending === 'issue' ? 'Issuance' : 'Closure';
        const errorMessage = newValue.cxSyncError || 'Unknown error';
        const userInField = newValue.cxSyncPending === 'issue' ? newValue.issuerSignature?.name : newValue.closureReceiverName;

        // 🚀 MAGIA DE ADJUNTOS: Tomamos la URL del PDF guardado y lo descargamos al vuelo
        const mailAttachments: any[] = [];
        let attachmentNotice = `<p style="color: #dc2626; font-size: 14px;"><strong>Note:</strong> PDF Backup not available for attachment.</p>`;

        if (newValue.pdfBackupUrl) {
            mailAttachments.push({
                filename: `EB_Permit_PF${permitNumber}_Backup.pdf`,
                path: newValue.pdfBackupUrl // Nodemailer lo descarga directamente desde el enlace del Storage
            });
            attachmentNotice = `
                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="color: #16a34a; font-weight: bold; margin: 0; font-size: 15px;">✅ PDF Attached Successfully</p>
                    <p style="color: #15803d; margin: 5px 0 0 0; font-size: 13px;">The completed permit has been attached to this email. You can directly upload it to iTwoCX.</p>
                </div>
            `;
        }

        const mailOptions = {
            from: '"Can you dig it - System" <EBApermits@gmail.com>',
            to: ALERT_EMAILS,
            subject: `🚨 ACTION REQUIRED: CX Sync Failed on PF#${permitNumber}`,
            html: `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #d97706; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 0;">iTwoCX Synchronization Failure</h2>
                    <p><strong>Permit:</strong> PF#${permitNumber}</p>
                    <p><strong>Attempted Action:</strong> ${action}</p>
                    <p><strong>Field User:</strong> ${userInField || 'Unknown'}</p>
                    
                    <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0;">
                        <p style="margin: 0;"><strong>Error reported by CX Server:</strong></p>
                        <p style="color: #dc2626; font-weight: bold; font-family: monospace; margin: 5px 0 0 0;">${errorMessage}</p>
                    </div>

                    ${attachmentNotice}

                    <hr style="border: 1px solid #eee; margin-top: 20px;">
                    <p style="font-size: 12px; color: #666; text-align: center;">
                        <em>The permit data is fully preserved in the Firebase database. No data was lost.</em><br>
                        <em>System Administration - EBA Digital Permits</em>
                    </p>
                </div>
            `,
            attachments: mailAttachments
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[ALERT] Email sent to ${ALERT_EMAILS} for permit PF#${permitNumber} with ${mailAttachments.length} attachments.`);
        } catch (error) {
            console.error('[ERROR] Failed to send alert email:', error);
        }
    }
});