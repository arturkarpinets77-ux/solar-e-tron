import { adminAuth, adminDb } from "../../../lib/firebaseAdmin";

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return req.body?.idToken || "";
}

function tsToMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  return 0;
}

async function recalcConstructionStates(objectId, constructionNumbers) {
  const uniqueNumbers = Array.from(
    new Set(
      (Array.isArray(constructionNumbers) ? constructionNumbers : [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
    )
  );

  if (!objectId || uniqueNumbers.length === 0) {
    return;
  }

  const reportsSnap = await adminDb
    .collection("ConstructionReports")
    .where("objectId", "==", objectId)
    .get();

  const reports = reportsSnap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
    }))
    .sort((a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt));

  const batch = adminDb.batch();

  uniqueNumbers.forEach((num) => {
    const relevant = reports.filter((r) => {
      return Array.isArray(r.constructionNumbers) && r.constructionNumbers.includes(num);
    });

    const stateRef = adminDb
      .collection("Objects")
      .doc(String(objectId))
      .collection("ConstructionStates")
      .doc(String(num));

    if (relevant.length === 0) {
      batch.delete(stateRef);
      return;
    }

    const last = relevant[relevant.length - 1];

    batch.set(
      stateRef,
      {
        number: num,
        frameStatus: String(last.frameStatus || "not_started"),
        panelStatus: String(last.panelStatus || "not_started"),
        customCategoryIds: Array.isArray(last.customCategoryIds)
          ? last.customCategoryIds
          : [],
        updatedAt: last.createdAt || null,
        updatedBy: last.authorUid || null,
        updatedByName: last.authorName || null,
        lastReportId: last.reportId || last.id,
        lastReportMode: last.reportMode || null,
        lastBrigadeId: last.brigadeId || null,
        lastBrigadeName: last.brigadeName || null,
      },
      { merge: false }
    );
  });

  await batch.commit();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      return res.status(401).json({ ok: false, error: "Missing ID token" });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decoded.uid;

    const requesterSnap = await adminDb.collection("Users").doc(requesterUid).get();
    if (!requesterSnap.exists) {
      return res.status(403).json({ ok: false, error: "User profile not found" });
    }

    const requester = requesterSnap.data() || {};
    const requesterRole = String(requester.role || "").toLowerCase();

    const reportId = String(req.body?.reportId || "").trim();
    if (!reportId) {
      return res.status(400).json({ ok: false, error: "Missing reportId" });
    }

    const reportRef = adminDb.collection("ConstructionReports").doc(reportId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      return res.status(404).json({ ok: false, error: "Report not found" });
    }

    const report = reportSnap.data() || {};
    const canManage = requesterRole === "admin" || requesterRole === "director";
    const isAuthor = String(report.authorUid || "") === requesterUid;

    if (!canManage && !isAuthor) {
      return res.status(403).json({ ok: false, error: "No permission to delete this report" });
    }

    const mirrorUserUids =
      Array.isArray(report.mirrorUserUids) && report.mirrorUserUids.length > 0
        ? report.mirrorUserUids
        : [String(report.authorUid || "")].filter(Boolean);

    const objectId = String(report.objectId || "");
    const constructionNumbers = Array.isArray(report.constructionNumbers)
      ? report.constructionNumbers
      : [];

    const deleteBatch = adminDb.batch();

    deleteBatch.delete(reportRef);

    mirrorUserUids.forEach((uid) => {
      const ref = adminDb
        .collection("Users")
        .doc(String(uid))
        .collection("ConstructionReports")
        .doc(reportId);

      deleteBatch.delete(ref);
    });

    await deleteBatch.commit();
    await recalcConstructionStates(objectId, constructionNumbers);

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to delete report",
    });
  }
}
