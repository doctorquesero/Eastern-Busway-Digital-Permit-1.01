import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getProjectCode } from '../utils/appMode'; // 🚀 IMPORTACIÓN DE LA DIMENSIÓN INTELIGENTE

// 🚀 DIRECCIÓN INTELIGENTE: Usamos Firebase Cloud Functions en Producción
const API_BASE = import.meta.env.DEV ? "/cxR/api" : "https://us-central1-eba-digital-permits.cloudfunctions.net";
const API_KEY = import.meta.env.VITE_API_KEY || 'eba-secret-key-2024';

let currentRole = localStorage.getItem('cx_current_role') || "";
let currentUserEmail = localStorage.getItem('cx_current_email') || "";

// Seguro para que el Motor Fantasma no se pise a sí mismo
let isProcessingQueue = false;

export const getUserRole = () => currentRole;
export const getCurrentUserEmail = () => currentUserEmail;
export const hasActiveSession = () => currentUserEmail.length > 0;
// Exportamos getProjectCode desde aquí por si alguna otra pantalla vieja de la app lo sigue importando desde cx.ts
export { getProjectCode };

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
// 🔄 MECANISMO DE AUTO-RECUPERACIÓN DE SESIÓN
// ============================================================================
const refreshSessionSilently = async () => {
    console.log("🔄 Intentando refrescar sesión de iTwoCX automáticamente...");
    const storedEmail = localStorage.getItem('cx_current_email');
    const storedPass = localStorage.getItem('cx_user_pass'); 

    if (!storedEmail || !storedPass) {
        throw new Error("No hay credenciales guardadas para refrescar la sesión. Requieres Log In manual.");
    }

    const loginUrl = import.meta.env.DEV 
        ? `/cxR/cxLogin` 
        : `${API_BASE}/cxLogin`;

    const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: storedEmail, password: storedPass })
    });

    const data = await response.json();
    if (data && data.SessionKey) {
        localStorage.setItem('cxSessionKey', data.SessionKey);
        console.log("✅ Sesión renovada con éxito en segundo plano.");
        return data.SessionKey;
    }
    throw new Error("Fallo al renovar sesión desde el servidor.");
};

// 🛡️ WRAPPER INTERCEPTOR: Atrapa errores de red, 403 y auto-refresca la sesión
const cxFetch = async (url: string, options: RequestInit) => {
    let res;
    
    try {
        res = await fetch(url, options);
    } catch (error: any) {
        // AQUÍ ATRAPAMOS EL CORTE FÍSICO DE INTERNET O SERVIDOR CAÍDO
        console.error("🚨 Falla de Red: Imposible conectar con iTwoCX (Offline).", error);
        throw new Error("NETWORK_OFFLINE");
    }

    if (res.status === 401 || res.status === 403) {
        console.warn(`⚠️ Sesión expirada (Error ${res.status}). Iniciando protocolo de auto-refresco...`);
        try {
            const newKey = await refreshSessionSilently();

            // Clonamos los headers originales y le inyectamos la llave nueva
            const headers = new Headers(options.headers);
            headers.set('x-cx-session-key', newKey);
            options.headers = headers;

            // Reintentamos la petición original automáticamente
            res = await fetch(url, options);
        } catch (err) {
            console.error("❌ Protocolo de auto-refresco fallido.");
            localStorage.removeItem('cxSessionKey'); // Limpiamos la llave rota
            throw new Error("Tu sesión de iTwoCX ha caducado por seguridad y no pudo ser renovada automáticamente. La operación se enviará a la cola pendiente.");
        }
    }
    return res;
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
    const currentProjectCode = getProjectCode(); // 🚀 Dinámico (EB o EB-DEMO)

    if (!sessionKey) return null;

    try {
        const url = import.meta.env.DEV
            ? `/cxR/Api/${currentProjectCode}/Document/GetByReference/${exactRef}`
            : `${API_BASE}/cxGetByReference?projectCode=${currentProjectCode}&reference=${exactRef}`;

        let res = await cxFetch(url, {
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
    } catch (e: any) {
        if (e.message === "NETWORK_OFFLINE") throw e;
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
        const currentProjectCode = getProjectCode(); // 🚀 Dinámico
        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        const paddedNum = num.padStart(4, '0');
        console.log(`Emitiendo permiso PF#${paddedNum} a status 'Issued' en el entorno [${currentProjectCode}]...`);
        
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

        const issueRes = await cxFetch(targetUrl, options);

        if (!issueRes.ok) {
            const errorText = await issueRes.text();
            console.error("Rechazo de iTwoCX Emisión:", errorText);
            throw new Error(`iTwoCX rechazó la emisión. Detalles: ${errorText}`);
        }
        console.log("Emisión confirmada en CX.");
        return { success: true, message: `🎉 SUCCESS!\n\nPermiso Emitido en iTwoCX (${currentProjectCode}).` };

    } catch (e: any) {
        console.error("Sync error emisión crítico:", e);
        if (e.message === "NETWORK_OFFLINE") {
            throw new Error("NETWORK_OFFLINE"); // Pasamos el error limpio a la app
        }
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
        const currentProjectCode = getProjectCode(); // 🚀 Dinámico

        if (!sessionKey) throw new Error("Acceso denegado: No tienes una sesión activa de iTwoCX.");

        // FASE 1: SUBIR EL PDF COMO ATTACHMENT
        if (permit.issuerSignature?.data?.startsWith('data:application/pdf')) {
            const base64Content = permit.issuerSignature.data.split(',')[1];
            const paddedNum = num.padStart(4, '0');
            const fileName = customFilename || `Unified_Permit_${paddedNum}_${new Date().getTime()}.pdf`;

            console.log(`Fase 1: Subiendo PDF (${fileName}) a CX en entorno [${currentProjectCode}]...`);

            const uploadUrl = import.meta.env.DEV
                ? `/cxR/Api/${currentProjectCode}/Attachment/Upload?documentId=${realCxId}`
                : `${API_BASE}/cxUploadAttachment?projectCode=${currentProjectCode}&documentId=${realCxId}`;

            const uploadPayload = { Name: fileName, ChunkId: 1, ChunkTotal: 1, Content: base64Content };

            const uploadRes = await cxFetch(uploadUrl, {
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

            const updateRes = await cxFetch(targetUrl, {
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
            return { success: true, internalId: realCxId, message: `🎉 SUCCESS!\n\nPermiso cerrado y PDF inyectado en iTwoCX (${currentProjectCode}).` };
        } else {
            return { success: true, internalId: realCxId, message: `Permiso PF#${num} sincronizado sin cambios.` };
        }

    } catch (e: any) {
        console.error("Sync error crítico:", e);
        if (e.message === "NETWORK_OFFLINE") {
            throw new Error("NETWORK_OFFLINE");
        }
        throw e;
    }
};

// ============================================================================
// 🚦 PROCESADOR DE LA COLA DE SINCRONIZACIÓN (BATCH SYNC - 10 SEGUNDOS)
// ============================================================================
export const processSyncQueue = async () => {
    // Si no hay internet físico o ya está corriendo, no hacemos nada
    if (!navigator.onLine || isProcessingQueue) return { total: 0, success: 0 };
    
    try {
        isProcessingQueue = true; // Bloqueamos para que no hayan ejecuciones dobles
        
        const q = query(collection(db, 'permits'), where('syncStatus', '==', 'pending'));
        const querySnapshot = await getDocs(q);
        
        const pendingPermits: any[] = [];
        querySnapshot.forEach(doc => pendingPermits.push({ id: doc.id, ...doc.data() }));

        if (pendingPermits.length === 0) {
            isProcessingQueue = false;
            return { total: 0, success: 0 };
        }

        console.log(`⚠️ Motor Fantasma: Encontrados ${pendingPermits.length} permisos atascados. Iniciando sincronización silenciosa...`);
        let successCount = 0;

        for (let i = 0; i < pendingPermits.length; i++) {
            const permit = pendingPermits[i];
            console.log(`[${i+1}/${pendingPermits.length}] Disparando PF#${permit.itwocxNumber} hacia CX...`);
            
            try {
                if (permit.status === 'issued') {
                     await issuePermitToCX(permit);
                } else if (permit.status === 'closed') {
                     await submitPermitToCX(permit);
                }
                
                // Si la promesa pasa, lo marcamos como exitoso
                await updateDoc(doc(db, 'permits', permit.id), { syncStatus: 'synced', cxSyncError: null });
                console.log(`✅ PF#${permit.itwocxNumber} restaurado con éxito.`);
                successCount++;
            } catch (err: any) {
                console.error(`❌ Fallo persistente en PF#${permit.itwocxNumber}:`, err.message);
                // Si falla, registramos el error pero lo dejamos pendiente
                await updateDoc(doc(db, 'permits', permit.id), { cxSyncError: err.message });
            }

            // Pausa de 5 segundos entre cada permiso para proteger el servidor de CX
            if (i < pendingPermits.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        isProcessingQueue = false;
        return { total: pendingPermits.length, success: successCount };
    } catch (error) {
        console.error("Error crítico en el Motor Fantasma:", error);
        isProcessingQueue = false;
        return { total: 0, success: 0 };
    }
};