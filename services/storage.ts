import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Permit } from '../types';
import { getTargetCollection, getAppMode } from '../utils/appMode';

// 🚀 REINICIO MAESTRO: Versión 3 (Pizarra 100% limpia)
const STORAGE_KEY = 'eba_permits_db_v3';

// 1. Cargamos la memoria del navegador al instante
const initialData = localStorage.getItem(STORAGE_KEY);
let localPermitsCache: Permit[] = initialData ? JSON.parse(initialData) : [];

// 2. ESCUCHA EN TIEMPO REAL A FIREBASE
onSnapshot(collection(db, getTargetCollection()), (snapshot) => {
  const permits: Permit[] = [];
  snapshot.forEach((doc) => {
    permits.push(doc.data() as Permit);
  });

  // Actualizamos nuestra memoria local con los datos frescos de la nube
  localPermitsCache = permits;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(permits));

  // Emitimos un evento personalizado
  window.dispatchEvent(new Event('firebase-data-updated'));
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localPermitsCache));

  // 2. GUARDADO EN LA NUBE (En segundo plano)
  const cleanPermitForFirebase = JSON.parse(JSON.stringify(permit));

  const permitRef = doc(db, getTargetCollection(), permit.id);
  setDoc(permitRef, cleanPermitForFirebase).catch(err => {
    console.error("🔥 Error guardando en Firebase:", err);
    alert(`Error syncing with Firebase: ${err.message}. Please check your internet connection.`);
  });
};

export const generatePermitNumber = (): string => {
  const count = localPermitsCache.length + 1;
  return `EB-PT-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
};