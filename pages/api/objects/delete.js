import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);

    return res.status(405).json({
      error: "Разрешён только метод POST.",
    });
  }

  try {
    const authorization = String(
      req.headers.authorization || ""
    );

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Не передан токен авторизации.",
      });
    }

    const idToken = authorization
      .replace("Bearer ", "")
      .trim();

    if (!idToken) {
      return res.status(401).json({
        error: "Пустой токен авторизации.",
      });
    }

    const decodedToken = await admin
      .auth()
      .verifyIdToken(idToken);

    const adminDb = admin.firestore();

    const userSnapshot = await adminDb
      .collection("Users")
      .doc(decodedToken.uid)
      .get();

    if (!userSnapshot.exists) {
      return res.status(403).json({
        error: "Профиль пользователя не найден.",
      });
    }

    const userData = userSnapshot.data() || {};

    const role = String(userData.role || "")
      .trim()
      .toLowerCase();

    const status = String(userData.status || "")
      .trim()
      .toLowerCase();

    if (
      status !== "active" ||
      (role !== "admin" && role !== "director")
    ) {
      return res.status(403).json({
        error: "Нет прав на удаление объекта.",
      });
    }

    const objectId = String(
      req.body?.objectId || req.body?.id || ""
    ).trim();

    if (!objectId) {
      return res.status(400).json({
        error: "Не указан идентификатор объекта.",
      });
    }

    const objectReference = adminDb
      .collection("Objects")
      .doc(objectId);

    const objectSnapshot =
      await objectReference.get();

    if (!objectSnapshot.exists) {
      return res.status(404).json({
        error: "Объект не найден.",
      });
    }

    /*
      Удаляет документ объекта и все его вложенные
      коллекции: фотографии, состояния конструкций,
      прогресс крыши и остальные данные объекта.
    */
    await adminDb.recursiveDelete(objectReference);

    return res.status(200).json({
      ok: true,
      objectId,
    });
  } catch (error) {
    console.error("Ошибка удаления объекта:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Не удалось удалить объект.",
    });
  }
}
