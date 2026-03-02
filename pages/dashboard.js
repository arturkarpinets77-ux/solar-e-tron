import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function DashboardPage() {
  const router = useRouter();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const snap = await getDoc(doc(db, "Users", user.uid));

      if (!snap.exists()) {
        router.push("/login");
        return;
      }

      const data = snap.data();

      if (String(data.status) !== "active") {
        router.push("/login");
        return;
      }

      setUserData({
        uid: user.uid,
        ...data,
      });

      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  const {
    firstName,
    lastName,
    email,
    personalNumber,
    role,
    status,
  } = userData;

  const isPrivileged = role === "admin" || role === "director";

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Кабинет</h1>

        <div style={styles.infoBox}>
          <div><b>Имя:</b> {firstName || "-"}</div>
          <div><b>Фамилия:</b> {lastName || "-"}</div>
          <div><b>E-mail:</b> {email}</div>
          <div><b>Личный номер:</b> {personalNumber}</div>
          <div><b>Роль:</b> {role}</div>
          <div><b>Статус:</b> {status}</div>
        </div>

        <div style={styles.actions}>
          <Link href="/workday" style={styles.actionBtn}>
            Отметка рабочего дня
          </Link>

          {isPrivileged && (
            <Link href="/admin/users" style={styles.actionBtnGreen}>
              Подтверждение пользователей
            </Link>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Выйти
          </button>

          <Link href="/" style={styles.homeLink}>
            На главную
          </Link>
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
    background: "#f5f7fb",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "100%",
    maxWidth: 600,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  h1: { margin: 0, fontSize: 32 },
  infoBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    lineHeight: 1.8,
  },
  actions: {
    marginTop: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  actionBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    textDecoration: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 800,
    textAlign: "center",
  },
  actionBtnGreen: {
    padding: "12px 14px",
    borderRadius: 12,
    textDecoration: "none",
    background: "#16a34a",
    color: "#fff",
    fontWeight: 800,
    textAlign: "center",
  },
  logoutBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  homeLink: {
    marginLeft: 14,
    color: "#1e40af",
    textDecoration: "none",
    fontWeight: 700,
  },
};
