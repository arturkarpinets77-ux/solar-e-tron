import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Стили (CSS Modules)
import workerStyles from "../../styles/worker.module.css";
import typography from "../../styles/typography.module.css";

export default function WorkerProfilePage() {
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

        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        setProfile({
          firstName,
          lastName,
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role: String(data.role || "").trim(),
          status: String(data.status || "").trim(),
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
      <main className={workerStyles.page}>
        <div className={workerStyles.card}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={workerStyles.page}>
        <div className={workerStyles.card}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={workerStyles.page}>
      <div className={workerStyles.card}>
        <div className={typography.h1}>Мой профиль</div>
        <div className={typography.sub}>Solar E-Tron</div>

        <div className={workerStyles.infoBox}>
          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>Имя:</span>
            <span className={workerStyles.value}>{profile.firstName || "-"}</span>
          </div>

          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>Фамилия:</span>
            <span className={workerStyles.value}>{profile.lastName || "-"}</span>
          </div>

          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>E-mail:</span>
            <span className={workerStyles.value}>{profile.email || "-"}</span>
          </div>

          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>Личный номер:</span>
            <span className={workerStyles.value}>{profile.personalNumber || "-"}</span>
          </div>

          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>Роль:</span>
            <span className={workerStyles.value}>{profile.role || "-"}</span>
          </div>

          <div className={workerStyles.infoRow}>
            <span className={workerStyles.label}>Статус:</span>
            <span className={workerStyles.value}>{profile.status || "-"}</span>
          </div>
        </div>

        {msg ? <div className={workerStyles.msg}>{msg}</div> : null}

        <div className={workerStyles.footerRow}>
          <button onClick={handleLogout} className={workerStyles.btnSecondary}>
            Выйти
          </button>

          <Link href="/worker" className={workerStyles.link}>
            ← Назад
          </Link>

          <Link href="/" className={workerStyles.link}>
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
