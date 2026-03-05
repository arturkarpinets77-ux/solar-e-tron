import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// CSS modules по ролям
import w from "../styles/worker.module.css";
import m from "../styles/manager.module.css";
import a from "../styles/accountant.module.css";

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

        let fullName = String(data.fullName || "").trim();
        if (!fullName && (firstName || lastName)) {
          fullName = `${firstName} ${lastName}`.trim();
        }

        setProfile({
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role: String(data.role || "").trim().toLowerCase(),
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

  // Выбор набора стилей по роли
  const s =
    profile?.role === "worker"
      ? w
      : profile?.role === "accountant"
      ? a
      : m; // director/admin -> manager

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

  const isManager = profile.role === "admin" || profile.role === "director";

  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.h1}>Кабинет</h1>
        {"sub" in s ? <div className={s.sub}>Solar E-Tron</div> : null}

        <div className={s.box}>
          <div><b>Имя:</b> {profile.firstName || "-"}</div>
          <div><b>Фамилия:</b> {profile.lastName || "-"}</div>
          <div><b>E-mail:</b> {profile.email || "-"}</div>
          <div><b>Личный номер:</b> {profile.personalNumber || "-"}</div>
          <div><b>Роль:</b> {profile.role || "-"}</div>
          <div><b>Статус:</b> {profile.status || "-"}</div>
        </div>

        {/* Блок кнопок по ролям */}
        {profile.role === "worker" ? (
          <div className={w.actions}>
            <Link className={w.btn} href="/workday">Отметка рабочего дня</Link>
            <button className={w.btn} onClick={() => alert("Скоро: История рабочего времени")}>История рабочего времени</button>
            <button className={w.btn} onClick={() => alert("Скоро: Фотоотчёт")}>Добавить фотоотчёт</button>
            <button className={w.btn} onClick={() => alert("Скоро: Мои данные")}>Мой профиль</button>
          </div>
        ) : profile.role === "accountant" ? (
          <div className={a.actions}>
            <Link className={a.btnLight} href="/workday">Просмотр рабочих дней</Link>
            <button className={a.btnLight} onClick={() => alert("Скоро: Отчёты/Экспорт")}>Отчёты (месяц)</button>
          </div>
        ) : (
          <div className={m.actions}>
            <Link className={m.btnLight} href="/admin">Активация пользователей</Link>
            <Link className={m.btnLight} href="/workday">Рабочие логи</Link>
            {isManager ? (
              <button className={m.btn} onClick={() => alert("Скоро: Управление сайтом/кнопками")}>
                Управление сайтом
              </button>
            ) : null}
          </div>
        )}

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div className={s.footerRow}>
          <button onClick={handleLogout} className={s.btnSecondary}>Выйти</button>
          <Link href="/" className={s.link}>На главную</Link>
        </div>
      </div>
    </main>
  );
}
