import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

export default function ManagerBrigadesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [workers, setWorkers] = useState([]);
  const [brigades, setBrigades] = useState([]);

  const [brigadeName, setBrigadeName] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setMsg("");

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
        const role = String(data.role || "").toLowerCase();
        const status = String(data.status || "").toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        await Promise.all([loadWorkers(), loadBrigades()]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки бригад");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadWorkers() {
    const snap = await getDocs(collection(db, "Users"));

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.role || "").toLowerCase() === "worker")
      .filter((u) => String(u.status || "").toLowerCase() === "active")
      .sort((a, b) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName, "ru");
      });

    setWorkers(list);
  }

  async function loadBrigades() {
    const q = query(collection(db, "Brigades"), orderBy("name"));
    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setBrigades(list);
  }

  function resetForm() {
    setBrigadeName("");
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

    const name = String(brigadeName || "").trim();

    if (!name) {
      setMsg("Укажи название бригады.");
      return;
    }

    if (selectedWorkers.length === 0) {
      setMsg("Выбери хотя бы одного работника.");
      return;
    }

    const memberNames = workers
      .filter((w) => selectedWorkers.includes(w.id))
      .map((w) => {
        const fullName =
          `${w.firstName || ""} ${w.lastName || ""}`.trim() || w.email || w.id;
        return fullName;
      });

    setSaving(true);
    try {
      const brigadeId = editingId || doc(collection(db, "Brigades")).id;

      await setDoc(
        doc(db, "Brigades", brigadeId),
        {
          name,
          memberUids: selectedWorkers,
          memberNames,
          updatedAt: serverTimestamp(),
          ...(editingId ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      resetForm();
      setMsg(editingId ? "Бригада обновлена." : "Бригада создана.");
      await loadBrigades();
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения бригады");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setBrigadeName(String(item.name || ""));
    setSelectedWorkers(Array.isArray(item.memberUids) ? item.memberUids : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(item) {
    const yes = window.confirm(`Удалить бригаду "${item.name || item.id}"?`);
    if (!yes) return;

    setDeletingId(item.id);
    setMsg("");

    try {
      await deleteDoc(doc(db, "Brigades", item.id));

      if (editingId === item.id) {
        resetForm();
      }

      setMsg("Бригада удалена.");
      await loadBrigades();
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления бригады");
    } finally {
      setDeletingId("");
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
            <div className={`${styles.title} ${typo.title}`}>Бригады</div>
            <div className={styles.subtitle}>
              Директор / администратор назначает участников и название бригады
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={labelStyle}>Название бригады</div>
              <input
                value={brigadeName}
                onChange={(e) => setBrigadeName(e.target.value)}
                placeholder="Например: Бригада 1"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>Участники бригады</div>

              <div style={workersBoxStyle}>
                {workers.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Нет активных работников</div>
                ) : (
                  workers.map((w) => {
                    const fullName =
                      `${w.firstName || ""} ${w.lastName || ""}`.trim() ||
                      w.email ||
                      w.id;

                    return (
                      <label key={w.id} style={workerRowStyle}>
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="submit"
                className={styles.actionButton}
                disabled={saving}
                style={{ opacity: saving ? 0.6 : 1, maxWidth: 240 }}
              >
                {saving
                  ? "Сохранение..."
                  : editingId
                  ? "Сохранить бригаду"
                  : "Создать бригаду"}
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

        <div style={{ fontWeight: 800, marginBottom: 10 }}>Список бригад</div>

        <div style={{ display: "grid", gap: 10 }}>
          {brigades.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Бригад пока нет</div>
          ) : (
            brigades.map((item) => (
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
                  <b>Участников:</b>{" "}
                  {Array.isArray(item.memberUids) ? item.memberUids.length : 0}
                </div>

                <div>
                  <b>Состав:</b>{" "}
                  {Array.isArray(item.memberNames) && item.memberNames.length
                    ? item.memberNames.join(", ")
                    : "-"}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => handleEdit(item)}
                  >
                    Редактировать
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    style={{
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 14px",
                      background: deletingId === item.id ? "#d9a9a9" : "#c94141",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: deletingId === item.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingId === item.id ? "Удаление..." : "Удалить"}
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

const labelStyle = {
  fontWeight: 700,
  marginBottom: 6,
};

const workersBoxStyle = {
  display: "grid",
  gap: 8,
  maxHeight: 260,
  overflowY: "auto",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255, 252, 240, 0.70)",
};

const workerRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};
