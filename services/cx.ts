import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// 🚀 DIRECCIÓN INTELIGENTE: Usamos Firebase Cloud Functions en Producción
const API_BASE = import.meta.env.DEV ? "/cxR/api" : "https://us-central1-eba-digital-permits.cloudfunctions.net";
const API_KEY = import.meta.env.VITE_API_KEY || 'eba-secret-key-2024';

let currentRole = localStorage.getItem('cx_current_role') || "";
let currentUserEmail = localStorage.getItem('cx_current_email') || "";
let currentProjectCode = localStorage.getItem('cx_project_code') || "EB-DEMO";

export const getUserRole = () => currentRole;
export const getCurrentUserEmail = () => currentUserEmail;
export const getProjectCode = () => currentProjectCode;
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
    localStorage.removeItem('cxSessionKey');
    console.log("🛑 LOCAL AND CX SESSION CLOSED");
};

// ============================================================================
// 🧠 ASIGNACIÓN DE ROLES DINÁMICA (DESDE FIREBASE)
// ============================================================================
export const assignUserRoleByEmail = async (email: string): Promise<string> => {
    const loginId = email.toLowerCase();
    let assignedRole = "Site Engineer"; // Rol por defecto si no está en la lista
    
    try {
        const docRef = doc(db, 'appSettings', 'global');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar Project Code global
            if (data.projectCode) {
                currentProjectCode = data.projectCode;
                localStorage.setItem('cx_project_code', data.projectCode);
            }

            // Buscar rol
            const roles: {email: string, role: string}[] = data.roleAssignments || [];
            const userMatch = roles.find(u => loginId.includes(u.email.toLowerCase()));
            
            if (userMatch) {
                assignedRole = userMatch.role;
            }
        } else {
            // Failsafe por si la DB está vacía: Dietrich siempre es Master
            if (loginId.includes('dietrich') || loginId.includes('eba-dt')) {
                assignedRole = "Master";
            }
        }
    } catch (error) {
        console.error("Error fetching roles from cloud:", error);
        if (loginId.includes('dietrich') || loginId.includes('eba-dt')) {
            assignedRole = "Master";
        }
    }

    currentRole = assignedRole;
    currentUserEmail = loginId;
    localStorage.setItem('cx_current_role', currentRole);
    localStorage.setItem('cx_current_email', loginId);

    return currentRole;
};

// ============================================================================
// ☁️ FUNCIONES DE SINCRONIZACIÓN CON iTwoCX 
// ============================================================================

export const getActiveSessionKey = () => {
    const key = localStorage.getItem('cxSessionKey');
    if (!key) {
        console.warn("⚠️ No se encontró la SessionKey de CX en el navegador.");
    }
    return key || "";
};

const findPermitInCX = async (num: string) => {
    const paddedNum = num.padStart(4, '0');
    const exactRef = encodeURIComponent(paddedNum);
    const sessionKey = getActiveSessionKey();

    if (!sessionKey) return null;

    try {
        const url = import.meta.env.DEV
            ? `/cxR/Api/${currentProjectCode}/Document/GetByReference/${exactRef}`
            : `${API_BASE}/cxGetByReference?projectCode=${currentProjectCode}&reference=${exactRef}`;

        let res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-cx-session-key': sessionKey
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

        const sessionKey = getActiveSessionKey();
        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        const paddedNum = num.padStart(4, '0');
        console.log(`Emitiendo permiso PF#${paddedNum} a status 'Issued'...`);
        
        const targetUrl = import.meta.env.DEV
            ? `/cxR/Api/${currentProjectCode}/Document/Update`
            : `${API_BASE}/cxIssuePermit?projectCode=${currentProjectCode}&reference=${encodeURIComponent(paddedNum)}`;

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

        let cxDoc = await findPermitInCX(num);
        if (!cxDoc) throw new Error(`El Permiso PF#${num.padStart(4, '0')} no fue encontrado en la base de datos de iTwoCX.`);

        let realCxId = cxDoc.Id;
        let needsUpdate = false;
        const sessionKey = getActiveSessionKey();

        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        // FASE 1: SUBIR EL PDF COMO ATTACHMENT
        if (permit.issuerSignature?.data?.startsWith('data:application/pdf')) {
            const base64Content = permit.issuerSignature.data.split(',')[1];
            const paddedNum = num.padStart(4, '0');
            const fileName = customFilename || `Unified_Permit_${paddedNum}_${new Date().getTime()}.pdf`;

            console.log(`Fase 1: Subiendo PDF (${fileName}) a CX...`);

            const uploadUrl = import.meta.env.DEV
                ? `/cxR/Api/${currentProjectCode}/Attachment/Upload?documentId=${realCxId}`
                : `${API_BASE}/cxUploadAttachment?projectCode=${currentProjectCode}&documentId=${realCxId}`;

            const uploadPayload = { Name: fileName, ChunkId: 1, ChunkTotal: 1, Content: base64Content };

            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                    'x-cx-session-key': sessionKey
                },
                body: JSON.stringify(uploadPayload)
            });

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                throw new Error(`Fallo al adjuntar el PDF a iTwoCX. Detalles: ${errText}`);
            }
        }

        // FASE 2: ACTUALIZAR EL ESTADO
        if (permit.status === 'closed') {
            cxDoc.StatusName = "Closed";
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Fase 2: Intentando cambiar estado a: ${cxDoc.StatusName}`);

            const targetUrl = import.meta.env.DEV
                ? `/cxR/Api/${currentProjectCode}/Document/Update`
                : `${API_BASE}/cxChangeStatus?projectCode=${currentProjectCode}`;

            const fetchMethod = import.meta.env.DEV ? 'PUT' : 'POST';

            const updateRes = await fetch(targetUrl, {
                method: fetchMethod,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                    'x-cx-session-key': sessionKey
                },
                body: JSON.stringify(cxDoc)
            });

            if (!updateRes.ok) {
                const errorText = await updateRes.text();
                throw new Error(`iTwoCX rechazó el cambio. Detalles: ${errorText}`);
            }
            return { success: true, internalId: realCxId, message: `🎉 SUCCESS!\n\nPermiso cerrado y PDF inyectado en iTwoCX.` };
        } else {
            return { success: true, internalId: realCxId, message: `Permiso PF#${num} sincronizado sin cambios.` };
        }

    } catch (e) {
        console.error("Sync error crítico:", e);
        throw e;
    }
};