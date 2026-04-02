import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не разрешён" });
  }

  try {
    const { objectId } = req.body;

    if (!objectId) {
      return res.status(400).json({ error: "Нет objectId" });
    }

    await deleteDoc(doc(db, "Objects", objectId));

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
