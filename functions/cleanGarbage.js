const admin = require('firebase-admin');

admin.initializeApp({
  projectId: "eba-digital-permits"
});

const db = admin.firestore();

async function cleanGarbage() {
  console.log("⏳ Buscando permits en Firestore...");
  const snapshot = await db.collection("permits").get();
  
  let deletedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Identificamos permisos basura: los que no son BG ni PUMP ni excavation ni pump.
    const pType = (data.permitType || "").toUpperCase();
    
    // Para ser conservadores, borramos todo lo que no sea de los tipos esperados
    if (pType !== "BG" && pType !== "PUMP" && pType !== "EXCAVATION" && pType !== "PUMP") {
      console.log(`🗑️ Eliminando permiso basura: ${doc.id} (Tipo: ${data.permitType}, Ref: ${data.permitNumber})`);
      await doc.ref.delete();
      deletedCount++;
    } else if (data.status === "draft" && !data.partAChecklist) {
      // También limpiamos malformados
      console.log(`🗑️ Eliminando borrador malformado: ${doc.id}`);
      await doc.ref.delete();
      deletedCount++;
    }
  }
  
  console.log(`✅ Proceso finalizado. Se eliminaron ${deletedCount} documentos basura.`);
}

cleanGarbage().catch(console.error);
