import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAry8scf3DziPEltqbpYTHCr2Dy-N029ck",
  authDomain: "eba-digital-permits.firebaseapp.com",
  projectId: "eba-digital-permits",
  storageBucket: "eba-digital-permits.firebasestorage.app",
  messagingSenderId: "521871702908",
  appId: "1:521871702908:web:c67a9fe99a5fe870e582f9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// 🚀 La persistencia ahora se maneja dinámicamente en LoginModal.tsx

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