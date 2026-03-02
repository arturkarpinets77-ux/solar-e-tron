import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

export default function AdminUsersPage() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const isPrivileged = useMemo(() => {
    return me?.role === "admin" || me?.role === "director";
  }, [me]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const mySnap = await getDoc(doc(db, "Users", user.uid));
      if (!mySnap.exists()) {
        router.push("/login");
        return;
      }

      const myData = mySnap.data();
      if (String(myData.status) !== "active") {
        router.push("/login");
        return;
      }

      const role = String(myData.role || "");
      if (role !== "admin" && role !== "director") {
        router.push("/dashboard");
        return;
      }

      setMe({ uid: user.uid, ...myData });
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function loadPending() {
    setMsg("");
    const q = query(
      collection(db, "Users"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setUsers(list);
  }

  useEffect(() => {
    if (!loading && isPrivileged) loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPrivileged]);

  async function setStatus(uid, status) {
    setMsg("");
    try {
      await updateDoc(doc(db, "Users", uid), {
        status,
        approvedBy: me.uid,
        approvedAt: new Date(),
      });
      await loadPending();
      setMsg(status === "active" ? "Пользователь активирован." : "Пользователь отклонён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка обновления статуса.");
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Подтверждение пользователей</h1>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={loadPending}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Обновить список
        </button>
      </div>

      {msg ? <div style={{ marginTop: 12 }}>{msg}</div> : null}

      <div style={{ marginTop: 16 }}>
        {users.length === 0 ? (
          <div>Нет пользователей со статусом pending.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div><b>UID:</b> {u.id}</div>
                <div><b>Имя:</b> {u.firstName || "-"}</div>
                <div><b>Фамилия:</b> {u.lastName || "-"}</div>
                <div><b>Email:</b> {u.email || "-"}</div>
                <div><b>Личный номер:</b> {u.personalNumber || "-"}</div>
                <div><b>Роль:</b> {u.role || "-"}</div>
                <div><b>Статус:</b> {u.status || "-"}</div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    onClick={() => setStatus(u.id, "active")}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#16a34a",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Активировать
                  </button>

                  <button
                    onClick={() => setStatus(u.id, "disabled")}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <Link href="/dashboard">← В кабинет</Link>
      </div>
    </main>
  );
}
