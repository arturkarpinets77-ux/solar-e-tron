import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function WorkdayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

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
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function markDay() {
    // Здесь позже добавим: запись времени + геолокации + фотоархив.
    setMsg("Ок. Позже сюда добавим отметку времени/геолокации/фото.");
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Отметка рабочего дня</h1>

      <button
        onClick={markDay}
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: "none",
          background: "transparent",
          color: "#fff",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Сделать отметку
      </button>

      {msg ? <div style={{ marginTop: 12 }}>{msg}</div> : null}

      <div style={{ marginTop: 16 }}>
        <Link href="/dashboard">← В кабинет</Link>
      </div>
    </main>
  );
}
