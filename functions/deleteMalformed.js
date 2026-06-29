const admin = require('firebase-admin');

// Inicializa Firebase Admin (usará tus credenciales locales o de proyecto si estás logueado en firebase CLI)
admin.initializeApp({
  projectId: "eba-digital-permits"
});

const db = admin.firestore();

async function cleanMalformedDrafts() {
  console.log("⏳ Buscando borradores (Drafts) en Firestore...");
  // Buscamos todos los permisos que estén en status 'draft'
  const snapshot = await db.collection("permits").where("status", "==", "draft").get();
  
  let deletedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Identificamos los borradores malformados porque les falta el esquema principal (ej: partAChecklist)
    if (!data.partAChecklist) {
      console.log(`🗑️ Eliminando borrador malformado: ${doc.id} (Ref: ${data.permitNumber})`);
      await doc.ref.delete();
      deletedCount++;
    }
  }
  
  console.log(`✅ Proceso finalizado. Se eliminaron ${deletedCount} borradores malformados.`);
}

cleanMalformedDrafts().catch(console.error);
