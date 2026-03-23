// 🚀 DIRECCIÓN INTELIGENTE: Usamos Firebase Cloud Functions en Producción
const API_BASE = import.meta.env.DEV ? "/cxR/api" : "https://us-central1-eba-digital-permits.cloudfunctions.net";
const API_KEY = import.meta.env.VITE_API_KEY || 'eba-secret-key-2024';
const PROJECT_CODE = "EB-DEMO";

let currentRole = localStorage.getItem('cx_current_role') || "";
let currentUserEmail = localStorage.getItem('cx_current_email') || "";

export const getUserRole = () => currentRole;
export const getCurrentUserEmail = () => currentUserEmail;

export const hasActiveSession = () => currentUserEmail.length > 0;

export const authenticateCX = async (email?: string, password?: string) => {
    console.warn("authenticateCX is deprecated. Autenticación manejada por Firebase y LoginModal.");
    return { success: false, role: "" };
};

export const logoutCX = () => {
    currentRole = "";
    currentUserEmail = "";
    localStorage.removeItem('cx_current_role');
    localStorage.removeItem('cx_current_email');
    localStorage.removeItem('cxSessionKey'); // Limpiamos la llave dinámica de iTwoCX al salir
    console.log("🛑 LOCAL AND CX SESSION CLOSED");
};

// ============================================================================
// 🛡️ LISTAS OFICIALES DE CONTROL DE ACCESO 
// ============================================================================
const MASTER_USERS = ['dietrich.truchsess', 'dietrich', 'eba-dt'];
const ISSUER_USERS = ['dietrich.truchsess', 'david.richmond', 'tommy.temple', 'krishna.nand', 'matt.grohn', 'michael.nicol', 'rangi.williams', 'ricky.bennenbroek', 'liam.colmer'];
const APPROVER_USERS = ['tommy.temple', 'krishna.nand', 'michael.nicol', 'cain.simpson', 'approver'];
const RECEIVER_USERS = ['david.richmond', 'rangi.williams', 'ricky.bennenbroek', 'will.ariki', 'ravinesh.ratnam', 'cameron.ellet', 'sudip.basnet', 'arepa.turua', 'barrie.hardfield', 'thisura.nissanka', 'krishhneel.kumar', 'sara.hall', 'darcy.hall'];

// ============================================================================
// 🧠 ASIGNACIÓN DE ROLES
// ============================================================================
export const assignUserRoleByEmail = (email: string): string => {
    const loginId = email.toLowerCase();
    let assignedRoles: string[] = [];

    if (MASTER_USERS.some(u => loginId.includes(u))) assignedRoles.push("Master");
    if (ISSUER_USERS.some(u => loginId.includes(u))) assignedRoles.push("Issuer");
    if (APPROVER_USERS.some(u => loginId.includes(u))) assignedRoles.push("Approver");
    if (RECEIVER_USERS.some(u => loginId.includes(u))) assignedRoles.push("Receiver");

    if (assignedRoles.length === 0) {
        currentRole = "Site Engineer";
    } else {
        currentRole = assignedRoles.join(",");
    }

    currentUserEmail = loginId;
    localStorage.setItem('cx_current_role', currentRole);
    localStorage.setItem('cx_current_email', loginId);

    return currentRole;
};

// ============================================================================
// ☁️ FUNCIONES DE SINCRONIZACIÓN CON iTwoCX 
// ============================================================================

// 🚀 EL CORAZÓN DE LA SEGURIDAD NATIVA: Obtenemos la llave dinámica
export const getActiveSessionKey = () => {
    const key = localStorage.getItem('cxSessionKey');
    if (!key) {
        console.warn("⚠️ No se encontró la SessionKey de CX en el navegador.");
    }
    return key || "";
};

const findPermitInCX = async (num: string) => {
    const exactRef = encodeURIComponent(num);
    const sessionKey = getActiveSessionKey(); // Obtenemos la llave fresca

    if (!sessionKey) return null; // Abortamos si no hay llave

    try {
        const url = import.meta.env.DEV
            ? `/cxR/Api/${PROJECT_CODE}/Document/GetByReference/${exactRef}`
            : `${API_BASE}/cxGetByReference?projectCode=${PROJECT_CODE}&reference=${exactRef}`;

        let res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-cx-session-key': sessionKey // 💉 INYECTAMOS LA LLAVE AL BACKEND
            },
        });

        if (res.ok) {
            let doc = await res.json();
            if (doc && doc.Id) return doc;
        } else {
            console.error(`Error GetByReference (Código ${res.status}):`, await res.text());
        }
    } catch (e) {
        console.error(`Fallo de red al conectar con CX.`, e);
    }
    return null;
};

export const issuePermitToCX = async (permit: any) => {
    try {
        const rawNumber = permit.itwocxNumber || permit.permitNumber || "";
        const num = rawNumber.replace(/\D/g, "");
        if (!num) throw new Error("El permiso no tiene un número PF válido.");

        const sessionKey = getActiveSessionKey(); // Obtenemos la llave fresca
        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        console.log(`Emitiendo permiso PF#${num} a status 'Issued'...`);
        const targetUrl = import.meta.env.DEV
            ? `/cxR/Api/${PROJECT_CODE}/Document/Update`
            : `${API_BASE}/cxIssuePermit?projectCode=${PROJECT_CODE}&reference=${encodeURIComponent(num)}`;

        const fetchMethod = import.meta.env.DEV ? 'PUT' : 'POST';

        const options: RequestInit = {
            method: fetchMethod,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-cx-session-key': sessionKey 
            }
        };

        if (import.meta.env.DEV) {
            let cxDoc = await findPermitInCX(num);
            if (!cxDoc) throw new Error("No se encontró el doc en CX local.");
            cxDoc.StatusName = "PERMIT ISSUED";
            options.body = JSON.stringify(cxDoc);
        }

        const issueRes = await fetch(targetUrl, options);

        if (!issueRes.ok) {
            const errorText = await issueRes.text();
            console.error("Rechazo de iTwoCX Emisión:", errorText);
            throw new Error(`iTwoCX rechazó la emisión. Detalles: ${errorText}`);
        }
        console.log("Emisión confirmada en CX.");
        return { success: true, message: `🎉 SUCCESS!\n\nPermiso Emitido en iTwoCX.` };

    } catch (e) {
        console.error("Sync error emisión crítico:", e);
        throw e;
    }
};

export const submitPermitToCX = async (permit: any, customFilename?: string) => {
    try {
        const rawNumber = permit.itwocxNumber || permit.permitNumber || "";
        const num = rawNumber.replace(/\D/g, "");
        if (!num) throw new Error("El permiso no tiene un número PF válido.");

        // Obtenemos el ID interno del documento
        let cxDoc = await findPermitInCX(num);
        if (!cxDoc) throw new Error(`El Permiso PF#${num} no fue encontrado en la base de datos de iTwoCX.`);

        let realCxId = cxDoc.Id;
        let needsUpdate = false;
        const sessionKey = getActiveSessionKey(); 

        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        // =================================================================
        // FASE 1: SUBIR EL PDF COMO ATTACHMENT INDEPENDIENTE
        // =================================================================
        if (permit.issuerSignature?.data?.startsWith('data:application/pdf')) {
            const base64Content = permit.issuerSignature.data.split(',')[1];
            const fileName = customFilename || `Unified_Permit_${num}_${new Date().getTime()}.pdf`;

            console.log(`Fase 1: Subiendo PDF (${fileName}) a CX para el documento ID: ${realCxId}...`);
            
            const uploadUrl = import.meta.env.DEV
                ? `/cxR/Api/${PROJECT_CODE}/Attachment/Upload?documentId=${realCxId}`
                : `${API_BASE}/cxUploadAttachment?projectCode=${PROJECT_CODE}&documentId=${realCxId}`;

            const uploadPayload = {
                Name: fileName,
                ChunkId: 1,
                ChunkTotal: 1,
                Content: base64Content
            };

            const uploadRes = await fetch(uploadUrl, {
                method: 'POST', // Siempre POST para Uploads según Swagger
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                    'x-cx-session-key': sessionKey
                },
                body: JSON.stringify(uploadPayload)
            });

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                console.error("Fallo al subir el PDF:", errText);
                throw new Error(`Fallo al adjuntar el PDF a iTwoCX. Detalles: ${errText}`);
            }
            console.log("PDF adjuntado exitosamente en iTwoCX.");
        }

        // =================================================================
        // FASE 2: ACTUALIZAR EL ESTADO DEL DOCUMENTO
        // =================================================================
        if (permit.status === 'closed') {
            const isCancelled = permit.ceaseWorksRecord && permit.ceaseWorksRecord.actionTaken === 'cancelled';
            cxDoc.StatusName = isCancelled ? "Cancelled" : "Closed";
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Fase 2: Intentando cambiar estado a: ${cxDoc.StatusName}`);
            
            const targetUrl = import.meta.env.DEV
                ? `/cxR/Api/${PROJECT_CODE}/Document/Update`
                : `${API_BASE}/cxChangeStatus?projectCode=${PROJECT_CODE}`;

            const fetchMethod = import.meta.env.DEV ? 'PUT' : 'POST';

            const updateRes = await fetch(targetUrl, {
                method: fetchMethod,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                    'x-cx-session-key': sessionKey // 💉 INYECTAMOS LA LLAVE AL BACKEND
                },
                body: JSON.stringify(cxDoc)
            });

            if (!updateRes.ok) {
                const errorText = await updateRes.text();
                console.error("Rechazo de iTwoCX:", errorText);
                throw new Error(`iTwoCX rechazó el cambio. Detalles: ${errorText}`);
            }
            console.log("Estado actualizado y documento sincronizado en CX correctamente.");
            return { success: true, internalId: realCxId, message: `🎉 SUCCESS!\n\nPermiso cerrado y PDF inyectado en iTwoCX.` };
        } else {
            return { success: true, internalId: realCxId, message: `Permiso PF#${num} sincronizado sin cambios.` };
        }

    } catch (e) {
        console.error("Sync error crítico:", e);
        throw e;
    }
};