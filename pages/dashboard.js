// pages/dashboard.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function DashboardPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Проверка доступа...");

  useEffect(() => {
    if (!auth || !db) {
      setMsg("Firebase не инициализирован.");
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
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
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        // Неактивных не пускаем в кабинеты
        if (status !== "active") {
          setMsg("Профиль ещё не активирован директором/админом.");
          return;
        }

        // Распределение по ролям
        if (role === "worker") {
          router.replace("/worker");
          return;
        }

        if (role === "director" || role === "admin") {
          router.replace("/manager");
          return;
        }

        if (role === "accountant") {
          router.replace("/accountant");
          return;
        }

        setMsg("Неизвестная роль пользователя.");
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля.");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>{msg}</div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
    fontSize: 18,
    fontWeight: 600,
  },
};
