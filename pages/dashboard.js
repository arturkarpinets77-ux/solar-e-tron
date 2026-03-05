import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import s from "../styles/worker.module.css";

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

        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        setProfile({
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role: String(data.role || "").trim(),
          status: String(data.status || "").trim(),
          firstName,
          lastName,
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
      <main className={s.page}>
        <div className={s.card}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={s.page}>
        <div className={s.card}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.title}>Кабинет</h1>
        <div className={s.sub}>Solar E-Tron</div>

        <div className={s.profileBox}>
          <div>
            <b>Имя:</b> {profile.firstName || "-"}
          </div>
          <div>
            <b>Фамилия:</b> {profile.lastName || "-"}
          </div>
          <div>
            <b>E-mail:</b> {profile.email || "-"}
          </div>
          <div>
            <b>Личный номер:</b> {profile.personalNumber || "-"}
          </div>
          <div>
            <b>Роль:</b> {profile.role || "-"}
          </div>
          <div>
            <b>Статус:</b> {profile.status || "-"}
          </div>
        </div>

        {/* КНОПКИ (вместо “голых” ссылок) */}
        <div className={s.actionsGrid}>
          <Link className={s.actionBtn} href="/workday">
            Отметка рабочего дня
          </Link>

          <Link className={s.actionBtn} href="/workday?tab=history">
            История рабочего времени
          </Link>

          <button className={s.actionBtn} type="button" onClick={() => alert("Скоро сделаем")}>
            Добавить фотоотчёт
          </button>

          <button className={s.actionBtn} type="button" onClick={() => alert("Скоро сделаем")}>
            Мой профиль
          </button>
        </div>

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div className={s.footerRow}>
          <button onClick={handleLogout} className={s.secondaryBtn} type="button">
            Выйти
          </button>

          <Link href="/" className={s.backLink}>
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
