// pages/manager/index.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ManagerDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);
  const [dayDoc, setDayDoc] = useState(null);

  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);
  const dayRef = useMemo(() => {
    if (!db || !profile?.uid) return null;
    return doc(db, "Users", profile.uid, "Workdays", dateKey);
  }, [profile?.uid, dateKey]);

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
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        const nextProfile = {
          uid: user.uid,
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role,
          status,
          firstName:
            String(data.firstName || "").trim() ||
            String(data.name || "").trim() ||
            "",
          lastName:
            String(data.lastName || "").trim() ||
            String(data.surname || "").trim() ||
            "",
        };

        setProfile(nextProfile);

        const wdSnap = await getDoc(doc(db, "Users", user.uid, "Workdays", dateKey));
        setDayDoc(wdSnap.exists() ? wdSnap.data() : null);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, dateKey]);

  async function refreshDay(uid) {
    if (!db || !uid) return;
    const wdSnap = await getDoc(doc(db, "Users", uid, "Workdays", dateKey));
    setDayDoc(wdSnap.exists() ? wdSnap.data() : null);
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      setMsg(e?.message || "Ошибка выхода");
    }
  }

  const started = !!dayDoc?.startAt;
  const ended = !!dayDoc?.endAt;

  const canStartDay = !started && !ended;
  const canEndDay = started && !ended;

  async function startDay() {
    setMsg("");
    if (!profile?.uid || !db) return;

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", dateKey);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() || {};
        if (data.startAt) {
          setMsg("Рабочий день уже начат.");
          return;
        }

        await updateDoc(ref, {
          dateKey,
          startAt: serverTimestamp(),
          endAt: null,
          breakStartAt: null,
          breakEndAt: null,
          status: "started",
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          dateKey,
          startAt: serverTimestamp(),
          endAt: null,
          breakStartAt: null,
          breakEndAt: null,
          status: "started",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await refreshDay(profile.uid);
      setMsg("Рабочий день начат.");
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось начать рабочий день");
    }
  }

  async function endDay() {
    setMsg("");
    if (!profile?.uid || !db) return;

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", dateKey);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setMsg("Сначала начни рабочий день.");
        return;
      }

      const data = snap.data() || {};

      if (!data.startAt) {
        setMsg("Сначала начни рабочий день.");
        return;
      }

      if (data.endAt) {
        setMsg("Рабочий день уже завершён.");
        return;
      }

      await updateDoc(ref, {
        endAt: serverTimestamp(),
        status: "ended",
        updatedAt: serverTimestamp(),
      });

      await refreshDay(profile.uid);
      setMsg("Рабочий день завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось завершить рабочий день");
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${typo.base}`}>
        <div className={styles.header}>
          <div>
            <div className={`${styles.title} ${typo.title}`}>
              Кабинет директора
            </div>
            <div className={styles.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Имя:</span>
            <span className={styles.value}>{profile.firstName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Фамилия:</span>
            <span className={styles.value}>{profile.lastName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>E-mail:</span>
            <span className={styles.value}>{profile.email || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Личный номер:</span>
            <span className={styles.value}>{profile.personalNumber || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Роль:</span>
            <span className={styles.value}>{profile.role || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Статус:</span>
            <span className={styles.value}>{profile.status || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Статус дня:</span>
            <span className={styles.value}>
              {ended ? "Завершён" : started ? "Идёт" : "Не начат"}
            </span>
          </div>
        </div>

        <div className={styles.actionsGrid}>
          <Link href="/admin/users" legacyBehavior>
            <a className={styles.actionButton}>Пользователи</a>
          </Link>

          <Link href="/manager/objects" legacyBehavior>
            <a className={styles.actionButton}>Объекты</a>
          </Link>

          <button
            className={styles.actionButton}
            type="button"
            onClick={startDay}
            disabled={!canStartDay}
            style={{ opacity: canStartDay ? 1 : 0.5 }}
          >
            Начать рабочий день
          </button>

          <button
            className={styles.actionButton}
            type="button"
            onClick={endDay}
            disabled={!canEndDay}
            style={{ opacity: canEndDay ? 1 : 0.5 }}
          >
            Завершить рабочий день
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.footer}>
          <button
            onClick={handleLogout}
            className={styles.btnSecondary}
            type="button"
          >
            Выйти
          </button>

          <Link href="/" className={styles.link}>
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
