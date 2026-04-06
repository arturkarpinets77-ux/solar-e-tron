import { useEffect, useMemo, useState } from "react";
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

function roleLabel(role) {
  const value = String(role || "").toLowerCase();
  if (value === "worker") return "Работник";
  if (value === "director") return "Директор";
  if (value === "admin") return "Администратор";
  return role || "-";
}

export default function ManagerBrigadesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [usersList, setUsersList] = useState([]);
  const [objectsList, setObjectsList] = useState([]);
  const [brigades, setBrigades] = useState([]);

  const [brigadeName, setBrigadeName] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const selectedObject = useMemo(() => {
    return objectsList.find((x) => x.id === selectedObjectId) || null;
  }, [objectsList, selectedObjectId]);

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

        await Promise.all([loadUsers(), loadObjects(), loadBrigades()]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки бригад");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadUsers() {
    const snap = await getDocs(collection(db, "Users"));

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        const role = String(u.role || "").toLowerCase();
        const status = String(u.status || "").toLowerCase();
        return status === "active" && (role === "worker" || role === "director");
      })
      .sort((a, b) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName, "ru");
      });

    setUsersList(list);
  }

  async function loadObjects() {
    const snap = await getDocs(collection(db, "Objects"));

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id), "ru")
      );

    setObjectsList(list);
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
    setSelectedObjectId("");
    setSelectedUsers([]);
    setEditingId(null);
  }

  function toggleUser(uid) {
    setSelectedUsers((prev) =>
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

    if (!selectedObjectId || !selectedObject) {
      setMsg("Выбери объект для бригады.");
      return;
    }

    if (selectedUsers.length === 0) {
      setMsg("Выбери хотя бы одного участника.");
      return;
    }

    const members = usersList
      .filter((u) => selectedUsers.includes(u.id))
      .map((u) => ({
        uid: u.id,
        name:
          `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
        role: String(u.role || ""),
        personalNumber: String(u.personalNumber || ""),
        email: String(u.email || ""),
      }));

    const memberNames = members.map((m) => m.name);

    setSaving(true);
    try {
      const brigadeId = editingId || doc(collection(db, "Brigades")).id;

      await setDoc(
        doc(db, "Brigades", brigadeId),
        {
          name,
          objectId: selectedObject.id,
          objectName: String(selectedObject.name || selectedObject.id),
          memberUids: selectedUsers,
          memberNames,
          members,
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
    setSelectedObjectId(String(item.objectId || ""));
    setSelectedUsers(Array.isArray(item.memberUids) ? item.memberUids : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(item) {
    const ok = window.confirm(`Удалить бригаду "${item.name || item.id}"?`);
    if (!ok) return;

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
              Директор / администратор назначает состав, название и объект бригады
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
              <div style={labelStyle}>Объект бригады</div>
              <select
                value={selectedObjectId}
                onChange={(e) => setSelectedObjectId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Выбери объект</option>
                {objectsList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Участники бригады</div>

              <div style={usersBoxStyle}>
                {usersList.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Нет активных работников и директоров</div>
                ) : (
                  usersList.map((u) => {
                    const fullName =
                      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                      u.email ||
                      u.id;

                    return (
                      <label key={u.id} style={userRowStyle}>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                        />
                        <span>
                          {fullName}
                          {u.personalNumber ? ` — ${u.personalNumber}` : ""}
                          {` (${roleLabel(u.role)})`}
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
                style={{ opacity: saving ? 0.6 : 1, maxWidth: 260 }}
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
                  <b>Объект:</b> {item.objectName || item.objectId || "-"}
                </div>

                <div>
                  <b>Участников:</b>{" "}
                  {Array.isArray(item.memberUids) ? item.memberUids.length : 0}
                </div>

                <div>
                  <b>Состав:</b>{" "}
                  {Array.isArray(item.members) && item.members.length
                    ? item.members
                        .map((m) => `${m.name}${m.role ? ` (${roleLabel(m.role)})` : ""}`)
                        .join(", ")
                    : Array.isArray(item.memberNames) && item.memberNames.length
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

const usersBoxStyle = {
  display: "grid",
  gap: 8,
  maxHeight: 260,
  overflowY: "auto",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255, 252, 240, 0.70)",
};

const userRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};
