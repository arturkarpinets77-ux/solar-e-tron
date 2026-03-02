import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
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

        // --- ВАЖНО: берём имя/фамилию из firstName/lastName
        // и делаем fallback на возможные старые поля
        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        // Если вдруг использовалось fullName:
        let fullName = String(data.fullName || "").trim();
        if (!fullName && (firstName || lastName)) {
          fullName = `${firstName} ${lastName}`.trim();
        }

        setProfile({
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role: String(data.role || "").trim(),
          status: String(data.status || "").trim(),
          firstName,
          lastName,
          fullName,
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      setMsg(e?.message || "Ошибка выхода");
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Кабинет</h1>

        <div style={styles.box}>
          <div><b>Имя:</b> {profile.firstName || "-"}</div>
          <div><b>Фамилия:</b> {profile.lastName || "-"}</div>
          <div><b>E-mail:</b> {profile.email || "-"}</div>
          <div><b>Личный номер:</b> {profile.personalNumber || "-"}</div>
          <div><b>Роль:</b> {profile.role || "-"}</div>
          <div><b>Статус:</b> {profile.status || "-"}</div>
        </div>

        {msg ? <div style={styles.msg}>{msg}</div> : null}

        <div style={{ marginTop: 14 }}>
          <button onClick={handleLogout} style={styles.btnSecondary}>
            Выйти
          </button>
          <Link href="/" style={styles.link}>
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
    maxWidth: 760,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  h1: { margin: 0, fontSize: 34 },
  box: {
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    lineHeight: 1.8,
  },
  msg: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "#f1f5f9",
    color: "#0f172a",
  },
  btnSecondary: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    cursor: "pointer",
    marginRight: 14,
  },
  link: { color: "#1e40af", textDecoration: "none", fontWeight: 700 },
};
