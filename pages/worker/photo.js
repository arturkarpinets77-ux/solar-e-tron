// pages/worker/photo.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db, storage } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeFileName(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

export default function WorkerPhotoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [objects, setObjects] = useState([]);
  const [objectId, setObjectId] = useState("");
  const [todayObjectLocked, setTodayObjectLocked] = useState(false);

  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);

  async function loadObjects(currentUid) {
    if (!db || !currentUid) return;

    const q = query(collection(db, "Objects"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          name: String(data.name || d.id),
          status: String(data.status || "active").toLowerCase(),
          visibleToWorkerUids: Array.isArray(data.visibleToWorkerUids)
            ? data.visibleToWorkerUids
            : [],
        };
      })
      .filter((obj) => {
        if (obj.status === "active") return true;
        if (obj.status === "inactive") return false;
        if (obj.status === "rework") {
          return obj.visibleToWorkerUids.includes(currentUid);
        }
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    setObjects(list);
  }

  async function loadTodayObject(uid) {
    if (!db || !uid) return;

    const workdayRef = doc(db, "Users", uid, "Workdays", dateKey);
    const snap = await getDoc(workdayRef);

    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.objectId) {
        setObjectId(String(data.objectId));
        setTodayObjectLocked(true);
      }
    }
  }

  async function loadPhotosByObject(currentObjectId) {
    if (!db || !currentObjectId) {
      setPhotos([]);
      return;
    }

    setPhotosLoading(true);
    setMsg("");

    try {
      const q = query(
        collection(db, "Objects", currentObjectId, "Photos"),
        orderBy("createdAt", "desc"),
        limit(40)
      );

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPhotos(list);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки фото");
    } finally {
      setPhotosLoading(false);
    }
  }

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setMsg("");
      setLoading(true);

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "Users", user.uid));
        if (!snap.exists()) {
          router.replace("/login");
          return;
        }

        const data = snap.data() || {};
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        if (status !== "active" || role !== "worker") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          uid: user.uid,
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          firstName: String(data.firstName || "").trim(),
          lastName: String(data.lastName || "").trim(),
          role,
          status,
        });

        await loadObjects(user.uid);
        await loadTodayObject(user.uid);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, dateKey]);

  useEffect(() => {
    if (!objectId) {
      setPhotos([]);
      return;
    }
    loadPhotosByObject(objectId);
  }, [objectId]);

  function getSelectedObjectName() {
    const found = objects.find((o) => o.id === objectId);
    return found ? found.name : "";
  }

  async function handleUpload(e) {
    e.preventDefault();
    setMsg("");

    if (!db || !storage || !profile?.uid) {
      setMsg("Firebase не инициализирован.");
      return;
    }

    if (!objectId) {
      setMsg("Выбери объект.");
      return;
    }

    if (!files.length) {
      setMsg("Выбери хотя бы один файл.");
      return;
    }

    setUploading(true);

    try {
      for (const file of files) {
        const photoRef = doc(collection(db, "Objects", objectId, "Photos"));
        const photoId = photoRef.id;
        const fileName = safeFileName(file.name);

        // Storage: Objects/{objectKey}/Photos/{photoId}/{fileName}
        const storagePath = `Objects/${objectId}/Photos/${photoId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file, {
          contentType: file.type || "application/octet-stream",
        });

        const url = await getDownloadURL(storageRef);

        // Firestore metadata: Objects/{objectKey}/Photos/{photoId}
        await setDoc(photoRef, {
          objectId,
          objectName: getSelectedObjectName(),
          fileName,
          storagePath,
          url,
          comment: comment.trim() || "",
          uploadedByUid: profile.uid,
          uploadedByEmail: profile.email || "",
          uploadedByPersonalNumber: profile.personalNumber || "",
          dateKey,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setFiles([]);
      setComment("");
      setMsg("Фото загружены ✅");
      const inp = document.getElementById("workerPhotoInput");
      if (inp) inp.value = "";

      await loadPhotosByObject(objectId);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки фото");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${typo.base}`}>
        <div className={styles.header}>
          <div>
            <div className={`${styles.title} ${typo.title}`}>
              Фотоотчёт по объекту
            </div>
            <div className={styles.subtitle}>
              Все активные работники видят фото выбранного объекта
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Объект</span>
            <span className={styles.value}>
              <select
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
                disabled={todayObjectLocked}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15, 23, 42, 0.18)",
                  background: "#fff",
                }}
              >
                <option value="">
                  {objects.length ? "Выбери объект..." : "Нет доступных объектов"}
                </option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>

              {todayObjectLocked ? (
                <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
                  Объект взят из отметки рабочего дня:{" "}
                  <b>{getSelectedObjectName()}</b>
                </div>
              ) : null}
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Комментарий</span>
            <span className={styles.value}>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий к фото (необязательно)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15, 23, 42, 0.18)",
                  background: "#fff",
                }}
              />
            </span>
          </div>

          <form onSubmit={handleUpload} style={{ marginTop: 12 }}>
            <input
              id="workerPhotoInput"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />

            <div style={{ marginTop: 12 }}>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={uploading}
                style={{ opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? "Загрузка..." : "Загрузить фото"}
              </button>
            </div>
          </form>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>
            Фото объекта {objectId ? `"${getSelectedObjectName()}"` : ""}
          </div>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => loadPhotosByObject(objectId)}
            disabled={photosLoading || !objectId}
            style={{ opacity: photosLoading || !objectId ? 0.6 : 1 }}
          >
            Обновить
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {photos.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              {objectId ? "Пока нет фото по этому объекту" : "Сначала выбери объект"}
            </div>
          ) : (
            photos.map((p) => (
              <div
                key={p.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.85)",
                  overflow: "hidden",
                }}
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.fileName || "photo"}
                    style={{
                      width: "100%",
                      height: 140,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 140,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.7,
                    }}
                  >
                    Нет preview
                  </div>
                )}

                <div style={{ padding: 10, fontSize: 12 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.fileName || p.id}
                  </div>

                  {p.comment ? (
                    <div style={{ opacity: 0.8, marginTop: 4 }}>{p.comment}</div>
                  ) : null}

                  <div style={{ opacity: 0.7, marginTop: 4 }}>
                    {p.uploadedByPersonalNumber
                      ? `Личный номер: ${p.uploadedByPersonalNumber}`
                      : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <Link className={styles.link} href="/worker">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}
