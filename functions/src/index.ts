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

    // Solo inyectar la llave si existe, WebKnight bloquea cabeceras vacías
    if (sessionKey) {
        headers["Key"] = sessionKey;
    }

    return { method, headers };
};

// Limpieza de referencia para evitar errores de codificación en la URL
const formatRef = (ref: string) => {
    const cleanRef = String(ref).replace(/\D/g, '');
    return `PF%23${cleanRef}`;
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

            // PASO 1: EncryptPassword (Usando el modelo JSON estricto del manual)
            const encryptUrl = `${CX_API_BASE}/Login/EncryptPassword`;
            
            const encryptRes = await fetch(encryptUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                // 🚀 FIX: Enviamos el objeto JSON tal cual lo pide el "Model Example" del Swagger
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

            // PASO 2: ByEmail
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
// 📧 MÓDULO DE ALERTAS Y VIGÍA DE FIREBASE
// ============================================================================

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'EBApermits@gmail.com',
        pass: 'umuymnsyxqnnmshz'
    }
});

export const notifyMasterOnSyncFailure = onDocumentUpdated('permits/{permitId}', async (event: any) => {
    if (!event.data) return;

    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    if (newValue.cxSyncPending && previousValue.cxSyncPending !== newValue.cxSyncPending) {
        const permitNumber = newValue.itwocxNumber || newValue.permitNumber || event.params.permitId;
        const action = newValue.cxSyncPending === 'issue' ? 'Issuance' : 'Closure';
        const errorMessage = newValue.cxSyncError || 'Unknown error';
        const userInField = newValue.cxSyncPending === 'issue' ? newValue.issuerSignature?.name : newValue.closureReceiverName;

        const mailOptions = {
            from: '"Can you dig it - System" <EBApermits@gmail.com>',
            to: 'dietrich.truchsess@easternbusway.nz',
            subject: `🚨 ALERT: CX Sync Failed on PF#${permitNumber}`,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2 style="color: #d97706;">iTwoCX Synchronization Failure</h2>
                    <p><strong>Permit:</strong> PF#${permitNumber}</p>
                    <p><strong>Attempted Action:</strong> ${action}</p>
                    <p><strong>Field User:</strong> ${userInField || 'Unknown'}</p>
                    <p><strong>Error reported by CX:</strong> <span style="color: #dc2626; font-weight: bold;">${errorMessage}</span></p>
                    <hr style="border: 1px solid #eee;">
                    <p style="font-size: 12px; color: #666;">
                        <em>The permit was successfully saved locally in Firebase and site work continues. The user received a success screen. Manual synchronization in iTwoCX is required.</em>
                    </p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[ALERT] Email sent to easternbusway.nz for permit PF#${permitNumber}`);
        } catch (error) {
            console.error('[ERROR] Failed to send alert email:', error);
        }
    }
});