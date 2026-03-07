// pages/admin/users.js
import { useEffect, useState } from "react";
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

export default function AdminUsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [msg, setMsg] = useState("");
  const [users, setUsers] = useState([]);

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

        const me = meSnap.data() || {};
        const role = String(me.role || "").trim().toLowerCase();
        const status = String(me.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "admin" && role !== "director") {
          router.replace("/dashboard");
          return;
        }

        await loadPendingUsers();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки пользователей");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadPendingUsers() {
    if (!db) return;

    const q = query(collection(db, "Users"), where("status", "==", "pending"));
    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    list.sort((a, b) => {
      const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
      const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
      return aName.localeCompare(bName);
    });

    setUsers(list);
  }

  async function approveUser(uid) {
    setMsg("");
    setSavingId(uid);

    try {
      await updateDoc(doc(db, "Users", uid), {
        status: "active",
      });

      setMsg("Пользователь подтверждён.");
      await loadPendingUsers();
    } catch (e) {
      setMsg(e?.message || "Ошибка подтверждения пользователя");
    } finally {
      setSavingId("");
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
              Подтверждение пользователей
            </div>
            <div className={styles.subtitle}>
              Директор / администратор подтверждает новых работников
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={loadPendingUsers}
          >
            Обновить список
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        {users.length === 0 ? (
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
            {users.map((u) => {
              const fullName =
                `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                `${u.name || ""} ${u.surname || ""}`.trim() ||
                "-";

              return (
                <div
                  key={u.id}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: "1px solid rgba(120, 90, 20, 0.16)",
                    background: "rgba(255, 252, 240, 0.82)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {fullName}
                  </div>

                  <div>
                    <b>E-mail:</b> {u.email || "-"}
                  </div>

                  <div>
                    <b>Личный номер:</b> {u.personalNumber || "-"}
                  </div>

                  <div>
                    <b>Роль:</b> {u.role || "-"}
                  </div>

                  <div>
                    <b>Статус:</b> {u.status || "-"}
                  </div>

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
