import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db, storage } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Простой “ключ объекта” (чтобы папки были стабильны)
function objectKeyFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яё\-]/gi, "");
}

export default function WorkerPhotoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [objectName, setObjectName] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);

  const [photos, setPhotos] = useState([]);

  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);
  const objectKey = useMemo(() => objectKeyFromName(objectName), [objectName]);

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

        // worker + active
        if (status !== "active" || role !== "worker") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          uid: user.uid,
          personalNumber: String(data.personalNumber || "").trim(),
          firstName: String(data.firstName || "").trim(),
          lastName: String(data.lastName || "").trim(),
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadPhotosForObject(okey) {
    setPhotos([]);
    if (!db || !okey) return;

    // Objects/{objectKey}/Photos (общие фото по объекту)
    const col = collection(db, "Objects", okey, "Photos");
    const q = query(col, orderBy("createdAt", "desc"), limit(20));

    const snaps = await getDocs(q);
    setPhotos(snaps.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    if (!objectKey) return;
    loadPhotosForObject(objectKey).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectKey]);

  async function handleUpload(e) {
    e.preventDefault();
    setMsg("");

    if (!profile?.uid) return;
    if (!storage) return setMsg("Storage не инициализирован (проверь lib/firebaseClient.js).");
    if (!objectName.trim()) return setMsg("Введите название объекта.");
    if (!file) return setMsg("Выберите фото.");

    const okey = objectKeyFromName(objectName);
    if (!okey) return setMsg("Некорректное название объекта.");

    try {
      // Storage path: workPhotos/{objectKey}/{YYYY-MM-DD}/{uid}_{timestamp}.jpg
      const ts = Date.now();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";

      const storagePath = `workPhotos/${okey}/${dateKey}/${profile.uid}_${ts}.${safeExt}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      // Firestore metadata: Objects/{objectKey}/Photos/{photoId}
      await addDoc(collection(db, "Objects", okey, "Photos"), {
        objectKey: okey,
        objectName: objectName.trim(),
        dateKey,
        url,
        storagePath,
        comment: comment.trim() || "",
        createdAt: serverTimestamp(),
        createdByUid: profile.uid,
        createdByPersonalNumber: profile.personalNumber || "",
      });

      setFile(null);
      setComment("");
      setMsg("Фото загружено.");
      await loadPhotosForObject(okey);
    } catch (e2) {
      setMsg(e2?.message || "Ошибка загрузки фото");
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
            <div className={`${styles.title} ${typo.title}`}>Фотоотчёт по объекту</div>
            <div className={styles.subtitle}>Все работники видят фото выбранного объекта</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Объект:</span>
            <span className={styles.value}>
              <input
                value={objectName}
                onChange={(e) => setObjectName(e.target.value)}
                placeholder="Например: ORY / Labva"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "rgba(255,255,255,0.85)",
                }}
              />
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Комментарий:</span>
            <span className={styles.value}>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Опционально"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "rgba(255,255,255,0.85)",
                }}
              />
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Файл:</span>
            <span className={styles.value}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </span>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={handleUpload} type="button">
            Загрузить фото
          </button>

          <Link href="/worker" className={styles.link}>
            ← Назад
          </Link>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Последние фото объекта {objectKey ? `"${objectKey}"` : ""}
        </div>

        {photos.length === 0 ? (
          <div className={styles.msg}>Пока нет фото (или объект не выбран).</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {photos.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 12,
                  alignItems: "center",
                  border: "1px solid rgba(15,23,42,0.10)",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(255,255,255,0.78)",
                }}
              >
                <img
                  src={p.url}
                  alt="photo"
                  style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 10 }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>{p.dateKey || "-"}</div>
                  <div style={{ opacity: 0.75 }}>{p.comment || "-"}</div>
                  <div style={{ opacity: 0.6, fontSize: 13 }}>
                    {p.createdByPersonalNumber ? `Личный номер: ${p.createdByPersonalNumber}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
