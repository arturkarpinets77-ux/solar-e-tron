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

function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  const target = new Date(dateString + "T23:59:59");
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryLabel(dateString) {
  const days = daysUntil(dateString);
  if (days === null) return "";
  if (days < 0) return "Срок истёк";
  if (days === 0) return "Истекает сегодня";
  if (days <= 30) return `Скоро истекает (${days} дн.)`;
  return `Осталось ${days} дн.`;
}

function expiryColor(dateString) {
  const days = daysUntil(dateString);
  if (days === null) return "rgba(15,23,42,0.75)";
  if (days < 0) return "#b91c1c";
  if (days <= 30) return "#b45309";
  return "#166534";
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

        setProfile({
          uid: user.uid,
          role,
          status,
        });

        await loadWorkers();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadWorkers() {
    if (!db) return;

    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((u) => String(u.role || "").toLowerCase() === "worker")
      .sort((a, b) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName);
      });

    setWorkers(list);
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
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

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
      await loadDocuments(selectedWorkerId);
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления документа");
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
              Документы работников
            </div>
            <div className={styles.subtitle}>
              Просмотр и удаление документов работников
            </div>
          </div>
        </div>

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
                  const fullName =
                    `${w.firstName || ""} ${w.lastName || ""}`.trim() ||
                    w.email ||
                    w.id;
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
              <b>Работник:</b>{" "}
              {`${selectedWorker.firstName || ""} ${selectedWorker.lastName || ""}`.trim() ||
                selectedWorker.email ||
                selectedWorker.id}
              {selectedWorker.personalNumber
                ? ` — ${selectedWorker.personalNumber}`
                : ""}
            </div>
          ) : null}
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Документы
        </div>

        {!selectedWorkerId ? (
          <div style={{ opacity: 0.7 }}>Сначала выбери работника</div>
        ) : docsLoading ? (
          <div style={{ opacity: 0.7 }}>Загрузка документов...</div>
        ) : documents.length === 0 ? (
          <div style={{ opacity: 0.7 }}>У этого работника пока нет документов</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {documents.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(120, 90, 20, 0.16)",
                  background: "rgba(255, 252, 240, 0.85)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {item.title || item.fileName || "Документ"}
                </div>

                <div>
                  <b>Файл:</b> {item.fileName || "-"}
                </div>

                <div>
                  <b>Срок действия:</b>{" "}
                  {item.expiresAt || item.expiryDate || "-"}
                </div>

                <div
                  style={{
                    color: expiryColor(item.expiresAt || item.expiryDate),
                    fontWeight: 700,
                  }}
                >
                  {expiryLabel(item.expiresAt || item.expiryDate)}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.link}
                    >
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
            ))}
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

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
};
