// ARCHIVO: src/services/cx.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getProjectCode } from '../utils/appMode';

let currentRole = localStorage.getItem('cx_current_role') || "";
let currentUserEmail = localStorage.getItem('cx_current_email') || "";

// ============================================================================
// 🛑 CIRCUIT BREAKER Y UTILIDADES (DUMMIES)
// ============================================================================
export const isCircuitBreakerActive = () => false;
export const getCircuitBreakerRemainingTime = () => 0;
export const activateCircuitBreaker = () => { console.log("Circuit breaker dummy activated"); };

export const getUserRole = () => currentRole;
export const getCurrentUserEmail = () => currentUserEmail;
export const hasActiveSession = () => currentUserEmail.length > 0;
export { getProjectCode };

export const authenticateCX = async (email?: string, password?: string) => {
    return { success: false, role: "" };
};

export const logoutCX = () => {
    currentRole = "";
    currentUserEmail = "";
    localStorage.removeItem('cx_current_role');
    localStorage.removeItem('cx_current_email');
    localStorage.removeItem('cxSessionKey');
};

export const getActiveSessionKey = () => { return ""; };

// ============================================================================
// 🧠 ASIGNACIÓN DE ROLES DINÁMICA (MANTENIDA PORQUE ES DE FIREBASE)
// ============================================================================
export const assignUserRoleByEmail = async (email: string): Promise<string> => {
    const loginId = email.toLowerCase();
    let assignedRole = "Site Engineer"; 
    
    try {
        const docRef = doc(db, 'appSettings', 'global');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const roles: {email: string, role: string}[] = data.roleAssignments || [];
            const userMatch = roles.find(u => loginId.includes(u.email.toLowerCase()));
            
            if (userMatch) {
                assignedRole = userMatch.role;
            }
        } else {
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
// 🔪 LOBOTOMÍA ABSOLUTA: FUNCIONES FANTASMA HACIA ITWOCX
// ============================================================================
export const issuePermitToCX = async (permit: any) => {
    console.log("🛑 BLOQUEO FÍSICO: El frontend tiene prohibido comunicarse con CX.");
    return { success: true, message: `Permit Saved Locally` };
};

export const submitPermitToCX = async (permit: any, customFilename?: string) => {
    console.log("🛑 BLOQUEO FÍSICO: El frontend tiene prohibido comunicarse con CX.");
    return { success: true, message: `Permit Saved Locally` };
};

export const processSyncQueue = async () => {
    console.log("🛑 BLOQUEO FÍSICO: La cola fantasma del frontend ha sido aniquilada.");
    return { total: 0, success: 0 };
};