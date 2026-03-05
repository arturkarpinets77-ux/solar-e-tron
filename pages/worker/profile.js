// pages/worker/profile.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db, storage } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  limit,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import styles from "../../styles/worker.module.css";

function safeFileName(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

export default function WorkerProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState([]);

  // form
  const [docTitle, setDocTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // YYYY-MM-DD
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

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
          await signOut(auth);
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
          firstName: String(data.firstName || "").trim(),
          lastName: String(data.lastName || "").trim(),
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role,
          status,
        });

      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadMyDocs(uid) {
    if (!db || !uid) return;
    setDocsLoading(true);
    try {
      const col = collection(db, "Users", uid, "Documents");
      const q = query(col, orderBy("createdAt", "desc"), limit(40));
      const snap = await getDocs(q);
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки документов");
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (!profile?.uid) return;
    loadMyDocs(profile.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  async function handleAddDoc(e) {
    e.preventDefault();
    setMsg("");

    if (!storage || !db) return setMsg("Firebase не инициализирован");
    if (!profile?.uid) return setMsg("Нет профиля");
    if (!docTitle.trim()) return setMsg("Укажи название документа");
    if (!expiresAt) return setMsg("Укажи срок действия (дату)");
    if (!file) return setMsg("Выбери файл");

    setBusy(true);
    try {
      const uid = profile.uid;

      // 1) создаём docId заранее
      const docId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
      const fileName = safeFileName(file.name);

      // Storage: Users/{uid}/Documents/{docId}/{fileName}
      const storagePath = `Users/${uid}/Documents/${docId}/${fileName}`;
      const fileRef = ref(storage, storagePath);

      await uploadBytes(fileRef, file, {
        contentType: file.type || "application/octet-stream",
      });

      const url = await getDownloadURL(fileRef);

      // 2) Firestore: Users/{uid}/Documents/{docId}
      await setDoc(doc(db, "Users", uid, "Documents", docId), {
        title: docTitle.trim(),
        expiresAt, // строка YYYY-MM-DD (пока так проще)
        storagePath,
        fileName,
        contentType: file.type || null,
        size: file.size || null,
        url,
        createdAt: serverTimestamp(),
      });

      setDocTitle("");
      setExpiresAt("");
      setFile(null);

      setMsg("Документ добавлен ✅");
      await loadMyDocs(uid);
    } catch (e2) {
      setMsg(e2?.message || "Ошибка добавления документа");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Мой профиль</h1>
          <p className={styles.subtitle}>Solar E-Tron</p>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoGrid}>
            <div className={styles.label}>Имя</div>
            <div className={styles.value}>{profile.firstName || "-"}</div>

            <div className={styles.label}>Фамилия</div>
            <div className={styles.value}>{profile.lastName || "-"}</div>

            <div className={styles.label}>E-mail</div>
            <div className={styles.value}>{profile.email || "-"}</div>

            <div className={styles.label}>Личный номер</div>
            <div className={styles.value}>{profile.personalNumber || "-"}</div>

            <div className={styles.label}>Роль</div>
            <div className={styles.value}>{profile.role || "-"}</div>

            <div className={styles.label}>Статус</div>
            <div className={styles.value}>{profile.status || "-"}</div>
          </div>
        </div>

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 8 }}>Мои документы</div>

        <form onSubmit={handleAddDoc} style={{ display: "grid", gap: 10 }}>
          <input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Название (например: Пожарная карта)"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.18)",
              background: "rgba(255,255,255,0.85)",
              outline: "none",
            }}
          />

          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.18)",
              background: "rgba(255,255,255,0.85)",
              outline: "none",
            }}
          />

          <input
            type="file"
            onChange={(e) => setFile((e.target.files && e.target.files[0]) || null)}
          />

          <button
            className={styles.actionButton}
            type="submit"
            disabled={busy}
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Загрузка..." : "Добавить документ"}
          </button>
        </form>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Список документов</div>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => loadMyDocs(profile.uid)}
            disabled={docsLoading}
            style={{ opacity: docsLoading ? 0.6 : 1 }}
          >
            Обновить
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {docs.map((d) => (
            <div
              key={d.id}
              style={{
                borderRadius: 14,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.85)",
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 800 }}>{d.title || "Документ"}</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Срок действия до: <b>{d.expiresAt || "-"}</b>
              </div>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6 }}>
                  Открыть файл
                </a>
              ) : null}
            </div>
          ))}
          {!docs.length ? <div style={{ opacity: 0.7 }}>Пока нет документов</div> : null}
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
