import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

function normalizeObjectKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яё\-]/gi, "");
}

export default function ManagerObjectsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);

  const [objects, setObjects] = useState([]);
  const [workers, setWorkers] = useState([]);

  // форма
  const [objectName, setObjectName] = useState("");
  const [objectStatus, setObjectStatus] = useState("active"); // active | inactive | rework
  const [selectedWorkers, setSelectedWorkers] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

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

        await Promise.all([loadObjects(), loadWorkers()]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadObjects() {
    const q = query(collection(db, "Objects"), orderBy("name"));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setObjects(list);
  }

  async function loadWorkers() {
    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.role || "").toLowerCase() === "worker")
      .filter((u) => String(u.status || "").toLowerCase() === "active")
      .sort((a, b) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName);
      });

    setWorkers(list);
  }

  function resetForm() {
    setObjectName("");
    setObjectStatus("active");
    setSelectedWorkers([]);
    setEditingId(null);
  }

  function toggleWorker(uid) {
    setSelectedWorkers((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setMsg("");

    const name = objectName.trim();
    const objectKey = normalizeObjectKey(name);

    if (!name) {
      setMsg("Укажи название объекта.");
      return;
    }

    if (!objectKey) {
      setMsg("Некорректное название объекта.");
      return;
    }

    if (objectStatus === "rework" && selectedWorkers.length === 0) {
      setMsg("Для статуса 'доработка' выбери хотя бы одного сотрудника.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        status: objectStatus, // active | inactive | rework
        visibleToWorkerUids: objectStatus === "rework" ? selectedWorkers : [],
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "Objects", editingId), payload);
      } else {
        await setDoc(doc(db, "Objects", objectKey), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      resetForm();
      setMsg("Объект сохранён.");
      await loadObjects();
    } catch (e2) {
      setMsg(e2?.message || "Ошибка сохранения объекта");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setObjectName(String(item.name || ""));
    setObjectStatus(String(item.status || "active"));
    setSelectedWorkers(Array.isArray(item.visibleToWorkerUids) ? item.visibleToWorkerUids : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function statusLabel(status) {
    if (status === "active") return "Активный";
    if (status === "inactive") return "Неактивный";
    if (status === "rework") return "Доработка";
    return status || "-";
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
              Объекты
            </div>
            <div className={styles.subtitle}>Управление объектами директора / администратора</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
            <div className={styles.infoRow}>
              <span className={styles.label}>Название объекта:</span>
              <span className={styles.value}>
                <input
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  placeholder="Например: ОРЬ"
                  style={inputStyle}
                />
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.label}>Статус:</span>
              <span className={styles.value}>
                <select
                  value={objectStatus}
                  onChange={(e) => setObjectStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="active">Активный</option>
                  <option value="inactive">Неактивный</option>
                  <option value="rework">Доработка</option>
                </select>
              </span>
            </div>

            {objectStatus === "rework" ? (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  Сотрудники, которые будут видеть объект:
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    maxHeight: 240,
                    overflowY: "auto",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(120, 90, 20, 0.16)",
                    background: "rgba(255, 252, 240, 0.70)",
                  }}
                >
                  {workers.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>Нет активных работников</div>
                  ) : (
                    workers.map((w) => {
                      const fullName =
                        `${w.firstName || ""} ${w.lastName || ""}`.trim() || w.email || w.id;

                      return (
                        <label
                          key={w.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedWorkers.includes(w.id)}
                            onChange={() => toggleWorker(w.id)}
                          />
                          <span>
                            {fullName}
                            {w.personalNumber ? ` — ${w.personalNumber}` : ""}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className={styles.actionButton}
                type="submit"
                disabled={saving}
                style={{ opacity: saving ? 0.6 : 1, maxWidth: 260 }}
              >
                {saving
                  ? "Сохранение..."
                  : editingId
                  ? "Сохранить изменения"
                  : "Создать объект"}
              </button>

              {editingId ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={resetForm}
                >
                  Отменить редактирование
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>Список объектов</div>

        <div style={{ display: "grid", gap: 10 }}>
          {objects.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Объектов пока нет</div>
          ) : (
            objects.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(120, 90, 20, 0.16)",
                  background: "rgba(255, 252, 240, 0.82)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800 }}>{item.name || item.id}</div>
                <div>
                  <b>Ключ:</b> {item.id}
                </div>
                <div>
                  <b>Статус:</b> {statusLabel(item.status)}
                </div>

                {item.status === "rework" ? (
                  <div>
                    <b>Видят сотрудники:</b>{" "}
                    {Array.isArray(item.visibleToWorkerUids) && item.visibleToWorkerUids.length
                      ? item.visibleToWorkerUids.length
                      : 0}
                  </div>
                ) : null}

                <div>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => handleEdit(item)}
                  >
                    Редактировать
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

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
