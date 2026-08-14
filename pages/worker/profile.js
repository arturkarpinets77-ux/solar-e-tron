import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
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
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

const WARNING_DAYS = 60;
const DANGER_DAYS = 30;

function fmtDate(yyyyMmDd) {
  if (!yyyyMmDd) return "-";
  if (typeof yyyyMmDd === "string") return yyyyMmDd;
  if (typeof yyyyMmDd?.toDate === "function") {
    const date = yyyyMmDd.toDate();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "-";
}

function dateFromValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(`${value}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function daysUntilExpiry(value) {
  const target = dateFromValue(value);
  if (!target) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetEnd = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    23,
    59,
    59
  );

  return Math.ceil((targetEnd.getTime() - todayStart.getTime()) / 86400000) - 1;
}

function expiryStatus(value) {
  const days = daysUntilExpiry(value);
  if (days === null) {
    return {
      tone: "neutral",
      priority: 99,
      days: null,
      label: "Срок не указан",
    };
  }

  if (days < 0) {
    return {
      tone: "red",
      priority: 0,
      days,
      label: `Срок истёк ${Math.abs(days)} дн. назад`,
    };
  }

  if (days <= DANGER_DAYS) {
    return {
      tone: "red",
      priority: 1,
      days,
      label: days === 0 ? "Истекает сегодня" : `Осталось ${days} дн.`,
    };
  }

  if (days <= WARNING_DAYS) {
    return {
      tone: "orange",
      priority: 2,
      days,
      label: `Осталось ${days} дн.`,
    };
  }

  return {
    tone: "green",
    priority: 3,
    days,
    label: `Осталось ${days} дн.`,
  };
}

function cardStyleForStatus(status) {
  if (status.tone === "red") {
    return {
      border: "2px solid #dc2626",
      background: "#fef2f2",
    };
  }

  if (status.tone === "orange") {
    return {
      border: "2px solid #f59e0b",
      background: "#fff7ed",
    };
  }

  return {
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.85)",
  };
}

function badgeStyleForStatus(status) {
  if (status.tone === "red") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
    };
  }

  if (status.tone === "orange") {
    return {
      color: "#9a3412",
      background: "#ffedd5",
    };
  }

  if (status.tone === "green") {
    return {
      color: "#166534",
      background: "#dcfce7",
    };
  }

  return {
    color: "rgba(15,23,42,0.75)",
    background: "rgba(255,255,255,0.8)",
  };
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
  const [deletingDocId, setDeletingDocId] = useState("");

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

        items.sort((a, b) => {
          const statusA = expiryStatus(a.expiresAt || a.expiryDate);
          const statusB = expiryStatus(b.expiresAt || b.expiryDate);
          if (statusA.priority !== statusB.priority) return statusA.priority - statusB.priority;
          return String(a.title || a.fileName || "").localeCompare(
            String(b.title || b.fileName || ""),
            "ru"
          );
        });

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
      const storagePath = `Users/${user.uid}/Documents/${docId}/${file.name}`;

      await setDoc(newDocRef, {
        title,
        expiryDate,
        fileName: file.name,
        contentType: file.type || "",
        size: file.size || 0,
        storagePath,
        url: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: file.type || "application/octet-stream",
      });

      const url = await getDownloadURL(storageRef);
      await updateDoc(newDocRef, { url, updatedAt: serverTimestamp() });

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

  async function handleDeleteDoc(item) {
    if (!db || !storage || !user?.uid || !item?.id) return;

    const ok = window.confirm(
      `Удалить документ "${item.title || item.fileName || item.id}"?`
    );

    if (!ok) return;

    setDeletingDocId(item.id);
    setMsg("");

    try {
      if (item.storagePath) {
        try {
          await deleteObject(ref(storage, item.storagePath));
        } catch (error) {
          if (error?.code !== "storage/object-not-found") {
            throw error;
          }
        }
      }

      await deleteDoc(doc(db, "Users", user.uid, "Documents", item.id));
      setMsg("Документ удалён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления документа");
    } finally {
      setDeletingDocId("");
    }
  }

  const documentAlerts = docsList
    .map((item) => ({
      ...item,
      expiryStatus: expiryStatus(item.expiresAt || item.expiryDate),
    }))
    .filter((item) => item.expiryStatus.tone === "red" || item.expiryStatus.tone === "orange");

  const redAlertsCount = documentAlerts.filter((item) => item.expiryStatus.tone === "red").length;

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

        {documentAlerts.length ? (
          <div
            style={{
              ...documentAlertStyle,
              borderColor: redAlertsCount ? "#dc2626" : "#f59e0b",
              background: redAlertsCount ? "#fef2f2" : "#fff7ed",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              Документы требуют внимания
            </div>
            <div>
              {redAlertsCount
                ? "Просроченные документы нужно удалить или заменить новым документом."
                : "Документы скоро закончатся. Проверь срок действия."}
            </div>
          </div>
        ) : null}

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
              style={inputStyle}
            />

            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              placeholder="Срок действия"
              style={inputStyle}
            />

            <input
              id="docFileInput"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={inputStyle}
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
              {docsList.map((d) => {
                const status = expiryStatus(d.expiresAt || d.expiryDate);
                const cardColors = cardStyleForStatus(status);
                const badgeColors = badgeStyleForStatus(status);

                return (
                  <div
                    key={d.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      display: "grid",
                      gap: 6,
                      ...cardColors,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{d.title || "Документ"}</div>

                    <div style={{ opacity: 0.85 }}>
                      Срок действия: <b>{fmtDate(d.expiryDate || d.expiresAt)}</b>
                    </div>

                    <div style={{ ...statusBadgeStyle, ...badgeColors }}>{status.label}</div>

                    <div style={{ opacity: 0.85 }}>
                      Файл:{" "}
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
                          открыть
                        </a>
                      ) : (
                        <span>(ссылка ещё не готова)</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => handleDeleteDoc(d)}
                      disabled={deletingDocId === d.id}
                      style={{ justifySelf: "start" }}
                    >
                      {deletingDocId === d.id ? "Удаление..." : "Удалить документ"}
                    </button>
                  </div>
                );
              })}
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

const documentAlertStyle = {
  display: "grid",
  gap: 7,
  marginTop: 14,
  marginBottom: 14,
  padding: 14,
  borderRadius: 16,
  border: "2px solid",
  color: "#111827",
};

const statusBadgeStyle = {
  width: "fit-content",
  padding: "6px 9px",
  borderRadius: 999,
  fontWeight: 900,
};

const inputStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.15)",
  background: "rgba(255,255,255,0.9)",
};
