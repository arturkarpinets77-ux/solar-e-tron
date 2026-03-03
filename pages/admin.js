import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [pending, setPending] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // Проверяем роль текущего пользователя
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
        await signOut(auth);
        router.replace("/login");
        return;
      }

      if (role !== "admin" && role !== "director") {
        router.replace("/dashboard");
        return;
      }

      setMe({ uid: user.uid, role });

      // Подписка на всех ожидающих активации
      const q = query(collection(db, "Users"), where("status", "==", "pending"));
      const unsubPending = onSnapshot(q, (qs) => {
        const arr = [];
        qs.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setPending(arr);
      });

      return () => unsubPending();
    });

    return () => unsub();
  }, [router]);

  async function activateUser(uid) {
    setMsg("");
    try {
      await updateDoc(doc(db, "Users", uid), {
        status: "active",
        activatedAt: serverTimestamp(),
        activatedBy: me?.uid || null,
      });
    } catch (e) {
      setMsg(e?.message || "Ошибка активации");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.replace("/");
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Активация пользователей</h1>
        <div style={styles.sub}>
          Доступ: {me?.role || "-"}
        </div>

        {msg ? <div style={styles.msg}>{msg}</div> : null}

        <div style={{ marginTop: 14 }}>
          {pending.length === 0 ? (
            <div style={styles.box}>Нет пользователей на активацию.</div>
          ) : (
            pending.map((u) => (
              <div key={u.id} style={styles.userRow}>
                <div>
                  <div><b>Имя:</b> {(u.firstName || "-") + " " + (u.lastName || "-")}</div>
                  <div><b>E-mail:</b> {u.email || "-"}</div>
                  <div><b>Личный номер:</b> {u.personalNumber || "-"}</div>
                  <div><b>Роль:</b> {u.role || "-"}</div>
                  <div><b>Статус:</b> {u.status || "-"}</div>
                </div>
                <button style={styles.btn} onClick={() => activateUser(u.id)}>
                  Активировать
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={handleLogout} style={styles.btnSecondary}>Выйти</button>
          <Link href="/dashboard" style={styles.link}>Кабинет</Link>
          <span style={{ margin: "0 10px" }} />
          <Link href="/" style={styles.link}>На главную</Link>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 24,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "100%",
    maxWidth: 900,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  h1: { margin: 0, fontSize: 30 },
  sub: { color: "#64748b", marginTop: 6 },
  msg: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "#f1f5f9",
    color: "#0f172a",
  },
  box: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    marginBottom: 10,
    background: "#fafafa",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#16a34a",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    cursor: "pointer",
    marginRight: 12,
  },
  link: { color: "#1e40af", textDecoration: "none", fontWeight: 700 },
};
