// pages/admin/users.js
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
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

const ROLE_OPTIONS = [
  { value: "worker", label: "worker" },
  { value: "accountant", label: "accountant" },
  { value: "director", label: "director" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "inactive", label: "inactive" },
];

export default function AdminUsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [msg, setMsg] = useState("");

  const [me, setMe] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);

  const [editMap, setEditMap] = useState({});

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
        const meSnap = await getDoc(doc(db, "Users", user.uid));
        if (!meSnap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const meData = meSnap.data() || {};
        const role = String(meData.role || "").trim().toLowerCase();
        const status = String(meData.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "admin" && role !== "director") {
          router.replace("/dashboard");
          return;
        }

        setMe({
          uid: user.uid,
          role,
          status,
        });

        await loadUsers(user.uid);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки пользователей");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadUsers(currentUid) {
    if (!db) return;

    const pendingQ = query(collection(db, "Users"), where("status", "==", "pending"));
    const pendingSnap = await getDocs(pendingQ);

    const pendingList = pendingSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aName = fullName(a);
        const bName = fullName(b);
        return aName.localeCompare(bName);
      });

    const allSnap = await getDocs(collection(db, "Users"));
    const activeList = allSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.status || "").toLowerCase() !== "pending")
      .filter((u) => u.id !== currentUid) // себя не даём менять
      .sort((a, b) => {
        const aName = fullName(a);
        const bName = fullName(b);
        return aName.localeCompare(bName);
      });

    setPendingUsers(pendingList);
    setActiveUsers(activeList);

    const nextEditMap = {};
    activeList.forEach((u) => {
      nextEditMap[u.id] = {
        role: String(u.role || "worker").toLowerCase(),
        status: String(u.status || "active").toLowerCase(),
      };
    });
    setEditMap(nextEditMap);
  }

  function fullName(u) {
    return (
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      `${u.name || ""} ${u.surname || ""}`.trim() ||
      u.email ||
      "-"
    );
  }

  function handleEditChange(uid, field, value) {
    setEditMap((prev) => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        [field]: value,
      },
    }));
  }

  async function approveUser(uid) {
    setMsg("");
    setSavingId(uid);

    try {
      await updateDoc(doc(db, "Users", uid), {
        status: "active",
      });

      setMsg("Пользователь подтверждён.");
      await loadUsers(me?.uid);
    } catch (e) {
      setMsg(e?.message || "Ошибка подтверждения пользователя");
    } finally {
      setSavingId("");
    }
  }

  async function saveUser(uid) {
    setMsg("");
    setSavingId(uid);

    try {
      const draft = editMap[uid];
      if (!draft) throw new Error("Нет данных для сохранения.");

      await updateDoc(doc(db, "Users", uid), {
        role: String(draft.role || "worker").toLowerCase(),
        status: String(draft.status || "active").toLowerCase(),
      });

      setMsg("Изменения сохранены.");
      await loadUsers(me?.uid);
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения пользователя");
    } finally {
      setSavingId("");
    }
  }

  const hasPending = useMemo(() => pendingUsers.length > 0, [pendingUsers.length]);
  const hasActive = useMemo(() => activeUsers.length > 0, [activeUsers.length]);

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
              Управление пользователями
            </div>
            <div className={styles.subtitle}>
              Подтверждение новых работников и изменение ролей
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => loadUsers(me?.uid)}
          >
            Обновить список
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 22 }}>
          Новые пользователи (pending)
        </div>

        {!hasPending ? (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              border: "1px solid rgba(120, 90, 20, 0.16)",
              background: "rgba(255, 252, 240, 0.82)",
            }}
          >
            Нет пользователей со статусом <b>pending</b>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                style={cardStyle}
              >
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {fullName(u)}
                </div>

                <div><b>E-mail:</b> {u.email || "-"}</div>
                <div><b>Личный номер:</b> {u.personalNumber || "-"}</div>
                <div><b>Роль:</b> {u.role || "-"}</div>
                <div><b>Статус:</b> {u.status || "-"}</div>

                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => approveUser(u.id)}
                    disabled={savingId === u.id}
                    style={{
                      maxWidth: 260,
                      opacity: savingId === u.id ? 0.6 : 1,
                    }}
                  >
                    {savingId === u.id ? "Подтверждение..." : "Подтвердить"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 22 }}>
          Активные / неактивные пользователи
        </div>

        {!hasActive ? (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              border: "1px solid rgba(120, 90, 20, 0.16)",
              background: "rgba(255, 252, 240, 0.82)",
            }}
          >
            Нет пользователей для отображения.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {activeUsers.map((u) => {
              const draft = editMap[u.id] || {
                role: String(u.role || "worker").toLowerCase(),
                status: String(u.status || "active").toLowerCase(),
              };

              return (
                <div
                  key={u.id}
                  style={cardStyle}
                >
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {fullName(u)}
                  </div>

                  <div><b>E-mail:</b> {u.email || "-"}</div>
                  <div><b>Личный номер:</b> {u.personalNumber || "-"}</div>

                  <div style={rowStyle}>
                    <span style={labelStyle}>Роль:</span>
                    <select
                      value={draft.role}
                      onChange={(e) => handleEditChange(u.id, "role", e.target.value)}
                      style={inputStyle}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={rowStyle}>
                    <span style={labelStyle}>Статус:</span>
                    <select
                      value={draft.status}
                      onChange={(e) => handleEditChange(u.id, "status", e.target.value)}
                      style={inputStyle}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => saveUser(u.id)}
                      disabled={savingId === u.id}
                      style={{
                        maxWidth: 260,
                        opacity: savingId === u.id ? 0.6 : 1,
                      }}
                    >
                      {savingId === u.id ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.footer}>
          <Link className={styles.link} href="/manager">
            ← В кабинет
          </Link>
        </div>
      </div>
    </main>
  );
}

const cardStyle = {
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255, 252, 240, 0.82)",
  display: "grid",
  gap: 8,
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 10,
  alignItems: "center",
  marginTop: 4,
};

const labelStyle = {
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
};
