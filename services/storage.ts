import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Permit } from '../types';
import { getTargetCollection, getAppMode } from '../utils/appMode';
import { sanitizeForFirestore } from '../utils/firestore';

// 🚀 REINICIO MAESTRO: Versión 3 (Pizarra 100% limpia)
const STORAGE_KEY = 'eba_permits_db_v3';

// 1. Cargamos la memoria del navegador al instante
const readStoredPermits = (): Permit[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Local permit cache unavailable:', e);
    return [];
  }
};
// iOS Safari (private mode / quota) throws on localStorage access; the in-memory cache must keep working
const writeStoredPermits = (permits: Permit[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(permits));
  } catch (e) {
    console.error('Local permit cache write failed:', e);
  }
};

let localPermitsCache: Permit[] = readStoredPermits();

// 2. ESCUCHA EN TIEMPO REAL A FIREBASE
onSnapshot(collection(db, getTargetCollection()), (snapshot) => {
  const permits: Permit[] = [];
  snapshot.forEach((doc) => {
    permits.push(doc.data() as Permit);
  });

  // Actualizamos nuestra memoria local con los datos frescos de la nube
  localPermitsCache = permits;
  writeStoredPermits(permits);

  // Emitimos un evento personalizado
  window.dispatchEvent(new Event('firebase-data-updated'));
}, (error) => {
  console.error('Firestore listener error:', error);
});

// ============================================================================
// FUNCIONES SÍNCRONAS
// ============================================================================

export const getPermits = (): Permit[] => {
  return localPermitsCache;
};

export const getPermitById = (id: string): Permit | undefined => {
  return localPermitsCache.find(p => p.id === id);
};

export const savePermit = (permit: Permit): void => {
  // FORCE ENVIRONMENT TAGGING TO PREVENT CROSS-CONTAMINATION
  permit.env = getAppMode();

  // 1. GUARDADO INSTANTÁNEO LOCAL
  const index = localPermitsCache.findIndex(p => p.id === permit.id);
  if (index >= 0) {
    localPermitsCache[index] = permit;
  } else {
    localPermitsCache.push(permit);
  }
  writeStoredPermits(localPermitsCache);

  // 2. GUARDADO EN LA NUBE (En segundo plano)
  const cleanPermitForFirebase = sanitizeForFirestore(permit);

  const permitRef = doc(db, getTargetCollection(), permit.id);
  setDoc(permitRef, cleanPermitForFirebase).catch(err => {
    console.error("🔥 Error guardando en Firebase:", err);
    alert(`Error syncing with Firebase: ${err.message}. Please check your internet connection.`);
  });
};

