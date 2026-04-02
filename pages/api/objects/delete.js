import { getAdminServices } from "../../../lib/firebaseAdmin";

async function deleteCollectionDocs(collectionRef) {
  const snap = await collectionRef.get();
  if (snap.empty) return;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = collectionRef.firestore.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { objectId } = req.body || {};

    if (!objectId) {
      return res.status(400).json({ error: "objectId is required" });
    }

    const { adminDb, bucket } = getAdminServices();

    const objectRef = adminDb.collection("Objects").doc(String(objectId));
    const objectSnap = await objectRef.get();

    if (!objectSnap.exists) {
      return res.status(404).json({ error: "Object not found" });
    }

    await deleteCollectionDocs(objectRef.collection("Photos"));
    await deleteCollectionDocs(objectRef.collection("MapMarkers"));
    await deleteCollectionDocs(objectRef.collection("Markings"));

    const prefix = `Objects/${objectId}/`;
    const [files] = await bucket.getFiles({ prefix });

    await Promise.all(
      files.map(async (file) => {
        try {
          await file.delete();
        } catch (_) {}
      })
    );

    await objectRef.delete();

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      error: e?.message || "Delete failed",
    });
  }
}
