import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { getApps, getApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

function fmtDate(yyyyMmDd) {
  if (!yyyyMmDd) return "-";
  return yyyyMmDd;
}

function roleLabel(role) {
  const value = String(role || "").toLowerCase();

  if (value === "worker") return "Работник";
  if (value === "accountant") return "Бухгалтер";
  if (value === "director") return "Директор";
  if (value === "admin") return "Администратор";

  return role || "-";
}

export default function WorkerProfilePage() {
  const router = useRouter();

  const storage = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!getApps().length) return null;
    return getStorage(getApp());
  }, []);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);

  const [docTitle, setDocTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [docsList, setDocsList] = useState([]);

  useEffect(() => {
    if (!auth || !db) return;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setMsg("");
      setLoading(true);

      if (!u) {
        router.replace("/login");
        return;
      }

      setUser(u);

      try {
        const snap = await getDoc(doc(db, "Users", u.uid));
        if (!snap.exists()) {
          router.replace("/login");
          return;
        }

        const data = snap.data() || {};
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        if (role !== "worker" || status !== "active") {
          router.replace("/dashboard");
          return;
        }

        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        setProfile({
          uid: u.uid,
          email: String(data.email || u.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role,
          status,
          firstName,
          lastName,
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, [router]);

  useEffect(() => {
    if (!db || !user?.uid) return;

    const q = query(
      collection(db, "Users", user.uid, "Documents"),
      orderBy("createdAt", "desc")
    );

    const unsubDocs = onSnapshot(
      q,
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setDocsList(items);
      },
      (err) => setMsg(err?.message || "Ошибка чтения документов")
    );

    return () => unsubDocs();
  }, [user?.uid]);

  async function handleUploadDoc(e) {
    e.preventDefault();
    setMsg("");

    if (!db || !user?.uid) return setMsg("Нет пользователя.");
    if (!storage) return setMsg("Storage не инициализирован (обнови страницу).");

    const title = docTitle.trim();
    if (!title) return setMsg("Укажи название документа.");
    if (!expiryDate) return setMsg("Укажи срок действия (дату).");
    if (!file) return setMsg("Выбери файл.");

    setUploading(true);

    try {
      const newDocRef = doc(collection(db, "Users", user.uid, "Documents"));
      const docId = newDocRef.id;

      await setDoc(newDocRef, {
        title,
        expiryDate,
        fileName: file.name,
        contentType: file.type || "",
        size: file.size || 0,
        storagePath: `Users/${user.uid}/Documents/${docId}/${file.name}`,
        url: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const storageRef = ref(
        storage,
        `Users/${user.uid}/Documents/${docId}/${file.name}`
      );
      await uploadBytes(storageRef, file, {
        contentType: file.type || "application/octet-stream",
      });

      const url = await getDownloadURL(storageRef);
      await updateDoc(newDocRef, {
        url,
        updatedAt: serverTimestamp(),
      });

      setDocTitle("");
      setExpiryDate("");
      setFile(null);

      const inp = document.getElementById("docFileInput");
      if (inp) inp.value = "";
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки документа");
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

  if (!profile) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${typo.base}`}>
        <div className={styles.header}>
          <div>
            <div className={`${styles.title} ${typo.title}`}>Мой профиль</div>
            <div className={styles.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Имя</span>
            <span className={styles.value}>{profile.firstName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Фамилия</span>
            <span className={styles.value}>{profile.lastName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>E-mail</span>
            <span className={styles.value}>{profile.email || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Личный номер</span>
            <span className={styles.value}>{profile.personalNumber || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Роль</span>
            <span className={styles.value}>{roleLabel(profile.role)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Статус</span>
            <span className={styles.value}>{profile.status || "-"}</span>
          </div>
        </div>

        <div className={styles.divider} />

        <h3 style={{ margin: "10px 0 8px" }}>Мои документы</h3>

        <form onSubmit={handleUploadDoc}>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Название (например: Пожарная карта)"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.15)",
                background: "rgba(255,255,255,0.9)",
              }}
            />

            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              placeholder="Срок действия"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.15)",
                background: "rgba(255,255,255,0.9)",
              }}
            />

            <input
              id="docFileInput"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.15)",
                background: "rgba(255,255,255,0.9)",
              }}
            />

            <button
              className={styles.actionButton}
              type="submit"
              disabled={uploading}
              style={{ opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "Загрузка..." : "Добавить документ"}
            </button>
          </div>
        </form>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Список документов</h3>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setMsg("")}
            title="Список обновляется автоматически"
          >
            Обновить
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {docsList.length === 0 ? (
            <div style={{ opacity: 0.8 }}>Пока нет документов</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {docsList.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.10)",
                    background: "rgba(255,255,255,0.85)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{d.title || "Документ"}</div>
                  <div style={{ opacity: 0.85 }}>
                    Срок действия: <b>{fmtDate(d.expiryDate)}</b>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    Файл:{" "}
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 800 }}
                      >
                        открыть
                      </a>
                    ) : (
                      <span>(ссылка ещё не готова)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
