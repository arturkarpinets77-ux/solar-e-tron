import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function DashboardRouter() {
  const router = useRouter();
  const [msg, setMsg] = useState("Загрузка...");

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.replace("/login");
          return;
        }

        const snap = await getDoc(doc(db, "Users", user.uid));
        if (!snap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const data = snap.data() || {};
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        // Статус обязателен
        if (status !== "active") {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        // Редирект по роли
        if (role === "worker") {
          router.replace("/worker");
          return;
        }

        if (role === "accountant") {
          router.replace("/accountant"); // создадим позже
          return;
        }

        if (role === "director" || role === "admin" || role === "manager") {
          router.replace("/manager"); // создадим позже
          return;
        }

        // Если роль неизвестна
        setMsg("Неизвестная роль пользователя. Обратитесь к администратору.");
      } catch (e) {
        setMsg(e?.message || "Ошибка распределителя кабинета");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ background: "rgba(255,255,255,0.9)", padding: 16, borderRadius: 12 }}>
        {msg}
      </div>
    </main>
  );
}
