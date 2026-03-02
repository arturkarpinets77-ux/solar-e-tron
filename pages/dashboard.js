import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebaseClient";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    // Если страница рендерится на сервере (build/SSR) — просто выходим
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          window.location.href = "/login";
          return;
        }

        const snap = await getDoc(doc(db, "Users", user.uid));
        setProfile(snap.exists() ? snap.data() : { email: user.email });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function handleLogout() {
    if (!auth) return;
    await signOut(auth);
    window.location.href = "/login";
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Кабинет</h1>

      <div style={{ marginTop: 12, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div><b>Имя:</b> {profile?.firstName ?? "-"}</div>
        <div><b>Фамилия:</b> {profile?.lastName ?? "-"}</div>
        <div><b>E-mail:</b> {profile?.email ?? "-"}</div>
        <div><b>Личный номер:</b> {profile?.personalNumber ?? "-"}</div>
        <div><b>Роль:</b> {profile?.role ?? "-"}</div>
        <div><b>Статус:</b> {profile?.status ?? "-"}</div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button onClick={handleLogout}>Выйти</button>
        <Link href="/">На главную</Link>
      </div>
    </div>
  );
}
