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
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

import styles from "../../styles/worker.module.css";

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

  const [objectKey, setObjectKey] = useState("ORB");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const canDelete = profile?.role === "admin" || profile?.role === "director";

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

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          uid: user.uid,
          role,
          status,
          email: String(data.email || user.email || "").trim(),
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const photosCol = useMemo(() => {
    if (!db) return null;
    return collection(db, "Objects", objectKey, "Photos");
  }, [objectKey]);

  async function loadPhotos() {
    if (!photosCol) return;
    setPhotosLoading(true);
    setMsg("");

    try {
      const q = query(photosCol, orderBy("createdAt", "desc"), limit(40));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPhotos(items);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки фото");
    } finally {
      setPhotosLoading(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, objectKey]);

  async function handleUpload(e) {
    e.preventDefault();
    setMsg("");

    if (!storage || !db) return setMsg("Firebase не инициализирован");
    if (!profile) return setMsg("Нет профиля");
    if (!objectKey.trim()) return setMsg("Укажи objectKey (код объекта)");
    if (!files.length) return setMsg("Выбери файлы для загрузки");

    setBusy(true);
    try {
      for (const file of files) {
        const photoId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
        const fileName = safeFileName(file.name);

        // Storage: Objects/{objectKey}/Photos/{photoId}/{fileName}
        const storagePath = `Objects/${objectKey}/Photos/${photoId}/${fileName}`;
        const fileRef = ref(storage, storagePath);

        await uploadBytes(fileRef, file, {
          contentType: file.type || "application/octet-stream",
        });

        const url = await getDownloadURL(fileRef);

        // Firestore: Objects/{objectKey}/Photos/{photoId}
        await setDoc(doc(db, "Objects", objectKey, "Photos", photoId), {
          objectKey,
          storagePath,
          fileName,
          contentType: file.type || null,
          size: file.size || null,
          url,
          uploadedBy: profile.uid,
          uploadedByEmail: profile.email || null,
          createdAt: serverTimestamp(),
        });
      }

      setFiles([]);
      setMsg("Загружено ✅");
      await loadPhotos();
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p) {
    setMsg("");
    if (!canDelete) return setMsg("Удалять может только директор/админ");
    if (!storage || !db) return;

    try {
      if (p?.storagePath) {
        await deleteObject(ref(storage, p.storagePath));
      }
      // метаданные в Firestore удалять можно позже (по желанию),
      // но по правилам Firestore у тебя тоже должно быть разрешение delete.
      // Сейчас оставим только удаление файла из Storage.
      setMsg("Файл удалён ✅");
      await loadPhotos();
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления");
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Фотоотчёты по объектам</h1>
          <p className={styles.subtitle}>Все активные работники видят фото. Удаляет только директор/админ.</p>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoGrid}>
            <div className={styles.label}>ObjectKey (код объекта)</div>
            <div className={styles.value}>
              <input
                value={objectKey}
                onChange={(e) => setObjectKey(e.target.value.trim())}
                placeholder="Например: ORB"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "rgba(255,255,255,0.85)",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <form onSubmit={handleUpload} style={{ marginTop: 14 }}>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />

            <div style={{ marginTop: 12 }}>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={busy}
                style={{ opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Загрузка..." : "Загрузить фото"}
              </button>
            </div>
          </form>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Последние фото (до 40)</div>
          <button
            className={styles.btnSecondary}
            onClick={loadPhotos}
            type="button"
            disabled={photosLoading}
            style={{ opacity: photosLoading ? 0.6 : 1 }}
          >
            Обновить
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {photos.map((p) => (
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
                <img src={p.url} alt={p.fileName || "photo"} style={{ width: "100%", height: 140, objectFit: "cover" }} />
              ) : (
                <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                  Нет preview
                </div>
              )}

              <div style={{ padding: 10, fontSize: 12 }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.fileName || p.id}
                </div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>{p.uploadedByEmail || ""}</div>

                {canDelete ? (
                  <button
                    onClick={() => handleDelete(p)}
                    className={styles.btnSecondary}
                    type="button"
                    style={{ marginTop: 8, width: "100%" }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          ))}
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
