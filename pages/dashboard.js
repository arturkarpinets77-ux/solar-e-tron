import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setError("");
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "Users", user.uid));
        if (!snap.exists()) throw new Error("Нет профиля Users/{uid}.");
        setProfile(snap.data());
      } catch (e) {
        setError(e?.message || "Ошибка профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <div style={{ color: "#64748b", marginTop: 6 }}>
          Реальная авторизация + Firestore профиль
        </div>

        {error ? (
          <div style={styles.err}>{error}</div>
        ) : (
          <div style={styles.box}>
            <div><b>Роль:</b> {profile?.role || "—"}</div>
            <div><b>Status:</b> {profile?.status || "—"}</div>
            <div><b>Личный номер:</b> {profile?.personalNumber || "—"}</div>
            <div><b>Email:</b> {profile?.email || "—"}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleLogout} style={styles.btn}>
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
    maxWidth: 720,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  box: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    background: "#f1f5f9",
    color: "#0f172a",
    lineHeight: 1.7,
  },
  err: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    background: "#fff1f2",
    color: "#9f1239",
    border: "1px solid #fecdd3",
  },
  btn: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  link: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 12,
    background: "#eef2ff",
    color: "#1e40af",
    textDecoration: "none",
    fontWeight: 800,
  },
};
