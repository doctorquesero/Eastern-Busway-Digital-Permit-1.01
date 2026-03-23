import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth"; // 🚀 NUEVO: Importamos el módulo de Autenticación

// Tus credenciales oficiales de Firebase (eba-digital-permits)
const firebaseConfig = {
  apiKey: "AIzaSyAry8scf3DziPEltqbpYTHCr2Dy-N029ck",
  authDomain: "eba-digital-permits.firebaseapp.com",
  projectId: "eba-digital-permits",
  storageBucket: "eba-digital-permits.firebasestorage.app",
  messagingSenderId: "521871702908",
  appId: "1:521871702908:web:c67a9fe99a5fe870e582f9"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Exportamos la base de datos de texto (Mantiene tu sistema actual funcionando)
export const db = getFirestore(app);

// Exportamos el disco duro para guardar las fotos pesadas
export const storage = getStorage(app);

// 🚀 NUEVO: Exportamos el sistema de inicio de sesión para que el Modal lo use
export const auth = getAuth(app);

// Función que sube la foto a la nube y devuelve el Link ligero al celular
export const uploadImageToStorage = async (base64String: string, filename: string): Promise<string> => {
  try {
    const storageRef = ref(storage, `permit_photos/${filename}`);
    await uploadString(storageRef, base64String, 'data_url');
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading to Firebase Storage:", error);
    throw new Error("Failed to upload image. Check storage rules or connection.");
  }
};