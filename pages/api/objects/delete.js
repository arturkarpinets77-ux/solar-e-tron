// pages/api/objects/delete.js
import { adminDb, adminStorage } from "../../../lib/firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { objectId } = req.body;

  if (!objectId) {
    return res.status(400).json({ error: "No objectId" });
  }

  try {
    // 🔥 Удаляем фото (Firestore)
    const photosSnap = await adminDb
      .collection("Objects")
      .doc(objectId)
      .collection("Photos")
      .get();

    const batch = adminDb.batch();

    photosSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // 🔥 Удаляем файлы из Storage
    const bucket = adminStorage.bucket();
    const prefix = `Objects/${objectId}/`;

    const [files] = await bucket.getFiles({ prefix });

    for (const file of files) {
      await file.delete().catch(() => {});
    }

    // 🔥 Удаляем сам объект
    await adminDb.collection("Objects").doc(objectId).delete();

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
