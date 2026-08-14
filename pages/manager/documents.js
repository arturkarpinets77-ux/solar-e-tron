// pages/manager/documents.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db, storage } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

const WARNING_DAYS = 60;
const DANGER_DAYS = 30;

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

function daysUntil(dateValue) {
  const target = dateFromValue(dateValue);
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

function expiryStatus(dateValue) {
  const days = daysUntil(dateValue);
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
    border: "1px solid rgba(120, 90, 20, 0.16)",
    background: "rgba(255, 252, 240, 0.85)",
  };
}

function labelStyleForStatus(status) {
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

function displayDate(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const date = dateFromValue(value);
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function workerName(worker) {
  return (
    `${worker.firstName || ""} ${worker.lastName || ""}`.trim() ||
    worker.email ||
    worker.personalNumber ||
    worker.id
  );
}

export default function ManagerDocumentsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [expiringDocuments, setExpiringDocuments] = useState([]);

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

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

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setProfile({ uid: user.uid, role, status });

        const loadedWorkers = await loadWorkers();
        await loadExpiringDocuments(loadedWorkers);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!router.isReady || !workers.length) return;
    const workerIdFromQuery = String(router.query.workerId || "").trim();
    if (workerIdFromQuery && workers.some((item) => item.id === workerIdFromQuery)) {
      setSelectedWorkerId(workerIdFromQuery);
    }
  }, [router.isReady, router.query.workerId, workers]);

  async function loadWorkers() {
    if (!db) return [];

    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.role || "").toLowerCase() === "worker")
      .sort((a, b) => workerName(a).localeCompare(workerName(b), "ru"));

    setWorkers(list);
    return list;
  }

  async function loadExpiringDocuments(workerList = workers) {
    const rows = [];

    for (const worker of workerList) {
      const snap = await getDocs(collection(db, "Users", worker.id, "Documents"));

      snap.docs.forEach((documentSnapshot) => {
        const data = documentSnapshot.data() || {};
        const expiryValue = data.expiresAt || data.expiryDate;
        const status = expiryStatus(expiryValue);

        if (status.tone !== "red" && status.tone !== "orange") return;

        rows.push({
          id: documentSnapshot.id,
          workerId: worker.id,
          workerName: workerName(worker),
          workerPersonalNumber: worker.personalNumber || "",
          title: data.title || data.fileName || "Документ",
          fileName: data.fileName || "",
          expiryValue,
          ...status,
        });
      });
    }

    rows.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.days - b.days;
    });

    setExpiringDocuments(rows);
  }

  async function loadDocuments(workerUid) {
    if (!db || !workerUid) {
      setDocuments([]);
      return;
    }

    setDocsLoading(true);
    setMsg("");

    try {
      const q = query(
        collection(db, "Users", workerUid, "Documents"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      list.sort((a, b) => {
        const statusA = expiryStatus(a.expiresAt || a.expiryDate);
        const statusB = expiryStatus(b.expiresAt || b.expiryDate);
        if (statusA.priority !== statusB.priority) return statusA.priority - statusB.priority;
        return String(a.title || a.fileName || "").localeCompare(
          String(b.title || b.fileName || ""),
          "ru"
        );
      });

      setDocuments(list);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки документов");
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedWorkerId) {
      setDocuments([]);
      return;
    }
    loadDocuments(selectedWorkerId);
  }, [selectedWorkerId]);

  async function handleDeleteDocument(item) {
    setMsg("");

    if (!db || !storage || !selectedWorkerId || !item?.id) return;

    const ok = window.confirm(
      `Удалить документ "${item.title || item.fileName || item.id}"?`
    );
    if (!ok) return;

    try {
      if (item.storagePath) {
        await deleteObject(ref(storage, item.storagePath));
      }

      await deleteDoc(doc(db, "Users", selectedWorkerId, "Documents", item.id));

      setMsg("Документ удалён.");
      await Promise.all([loadDocuments(selectedWorkerId), loadExpiringDocuments()]);
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления документа");
    }
  }

  const redCount = expiringDocuments.filter((item) => item.tone === "red").length;
  const orangeCount = expiringDocuments.filter((item) => item.tone === "orange").length;

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
            <div className={`${styles.title} ${typo.title}`}>Документы работников</div>
            <div className={styles.subtitle}>
              Контроль сроков действия, просмотр и удаление документов работников
            </div>
          </div>
        </div>

        {expiringDocuments.length ? (
          <div style={summaryWarningStyle}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              Документы требуют внимания
            </div>
            <div>
              Красных: <b>{redCount}</b>, оранжевых: <b>{orangeCount}</b>. Сначала показаны просроченные и самые срочные.
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {expiringDocuments.slice(0, 10).map((item) => (
                <button
                  key={`${item.workerId}-${item.id}`}
                  type="button"
                  onClick={() => setSelectedWorkerId(item.workerId)}
                  style={{
                    ...alertRowButtonStyle,
                    borderColor: item.tone === "red" ? "#dc2626" : "#f59e0b",
                    background: item.tone === "red" ? "#fee2e2" : "#ffedd5",
                    color: item.tone === "red" ? "#991b1b" : "#9a3412",
                  }}
                >
                  {item.workerName}: {item.title} — {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Выбери работника:</span>
            <span className={styles.value}>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Выбери работника...</option>
                {workers.map((w) => {
                  const fullName = workerName(w);
                  return (
                    <option key={w.id} value={w.id}>
                      {fullName}
                      {w.personalNumber ? ` — ${w.personalNumber}` : ""}
                    </option>
                  );
                })}
              </select>
            </span>
          </div>

          {selectedWorker ? (
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              <b>Работник:</b> {workerName(selectedWorker)}
              {selectedWorker.personalNumber ? ` — ${selectedWorker.personalNumber}` : ""}
            </div>
          ) : null}
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>Документы</div>

        {!selectedWorkerId ? (
          <div style={{ opacity: 0.7 }}>Сначала выбери работника</div>
        ) : docsLoading ? (
          <div style={{ opacity: 0.7 }}>Загрузка документов...</div>
        ) : documents.length === 0 ? (
          <div style={{ opacity: 0.7 }}>У этого работника пока нет документов</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {documents.map((item) => {
              const status = expiryStatus(item.expiresAt || item.expiryDate);
              const cardColors = cardStyleForStatus(status);
              const labelColors = labelStyleForStatus(status);

              return (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 14,
                    padding: 14,
                    display: "grid",
                    gap: 8,
                    ...cardColors,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{item.title || item.fileName || "Документ"}</div>

                  <div>
                    <b>Файл:</b> {item.fileName || "-"}
                  </div>

                  <div>
                    <b>Срок действия:</b> {displayDate(item.expiresAt || item.expiryDate)}
                  </div>

                  <div style={{ ...statusBadgeStyle, ...labelColors }}>{status.label}</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className={styles.link}>
                        Открыть файл
                      </a>
                    ) : null}

                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => handleDeleteDocument(item)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.footer}>
          <Link className={styles.link} href="/manager">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}

const summaryWarningStyle = {
  display: "grid",
  gap: 6,
  marginTop: 14,
  marginBottom: 14,
  padding: 14,
  borderRadius: 16,
  border: "2px solid #dc2626",
  background: "#fff7ed",
  color: "#111827",
};

const alertRowButtonStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid",
  font: "inherit",
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
};

const statusBadgeStyle = {
  width: "fit-content",
  padding: "6px 9px",
  borderRadius: 999,
  fontWeight: 900,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
};
