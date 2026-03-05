// pages/workday.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import styles from "../styles/worker.module.css";

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WorkdayPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [dayDoc, setDayDoc] = useState(null);

  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);

  const dayRef = useMemo(() => {
    if (!db || !user?.uid) return null;
    return doc(db, "Users", user.uid, "Workdays", dateKey);
  }, [user?.uid, dateKey]);

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (u) => {
      setMsg("");
      setLoading(true);

      if (!u) {
        router.replace("/login");
        return;
      }

      setUser(u);

      try {
        const snap = await getDoc(doc(db, "Users", u.uid));
        if (!snap.exists()) {
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

        // Если захочешь — можно разрешить директору/админу тоже заходить сюда
        if (role !== "worker") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          firstName: String(data.firstName || "").trim(),
          lastName: String(data.lastName || "").trim(),
          email: String(data.email || u.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role,
          status,
        });

        if (dayRef) {
          const d = await getDoc(dayRef);
          setDayDoc(d.exists() ? d.data() : null);
        }
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, dayRef]);

  async function refreshDay() {
    if (!dayRef) return;
    const s = await getDoc(dayRef);
    setDayDoc(s.exists() ? s.data() : null);
  }

  const started = !!dayDoc?.startAt;
  const breakStarted = !!dayDoc?.breakStartAt;
  const breakEnded = !!dayDoc?.breakEndAt;
  const ended = !!dayDoc?.endAt;

  const canStartDay = !started && !ended;
  const canStartBreak = started && !ended && !breakStarted;
  const canEndBreak = started && !ended && breakStarted && !breakEnded;
  const canEndDay = started && !ended;

  async function startDay() {
    setMsg("");
    if (!dayRef) return;

    try {
      const s = await getDoc(dayRef);
      if (s.exists()) {
        const d = s.data() || {};
        if (d.startAt) return setMsg("Рабочий день уже начат.");
        await updateDoc(dayRef, {
          dateKey,
          startAt: serverTimestamp(),
          status: "started",
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(dayRef, {
          dateKey,
          startAt: serverTimestamp(),
          breakStartAt: null,
          breakEndAt: null,
          endAt: null,
          status: "started",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await refreshDay();
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось начать день");
    }
  }

  async function startBreak() {
    setMsg("");
    if (!dayRef) return;

    try {
      const s = await getDoc(dayRef);
      if (!s.exists()) return setMsg("Сначала начни рабочий день.");

      const d = s.data() || {};
      if (!d.startAt) return setMsg("Сначала начни рабочий день.");
      if (d.endAt) return setMsg("День уже завершён.");
      if (d.breakStartAt) return setMsg("Перерыв уже начат.");

      await updateDoc(dayRef, {
        breakStartAt: serverTimestamp(),
        status: "break",
        updatedAt: serverTimestamp(),
      });
      await refreshDay();
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось начать перерыв");
    }
  }

  async function endBreak() {
    setMsg("");
    if (!dayRef) return;

    try {
      const s = await getDoc(dayRef);
      if (!s.exists()) return setMsg("Нет активного рабочего дня.");

      const d = s.data() || {};
      if (!d.breakStartAt) return setMsg("Перерыв ещё не начат.");
      if (d.breakEndAt) return setMsg("Перерыв уже завершён.");
      if (d.endAt) return setMsg("День уже завершён.");

      await updateDoc(dayRef, {
        breakEndAt: serverTimestamp(),
        status: "started",
        updatedAt: serverTimestamp(),
      });
      await refreshDay();
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось завершить перерыв");
    }
  }

  async function endDay() {
    setMsg("");
    if (!dayRef) return;

    try {
      const s = await getDoc(dayRef);
      if (!s.exists()) return setMsg("Сначала начни рабочий день.");

      const d = s.data() || {};
      if (!d.startAt) return setMsg("Сначала начни рабочий день.");
      if (d.endAt) return setMsg("День уже завершён.");

      if (d.breakStartAt && !d.breakEndAt) {
        return setMsg("Сначала заверши перерыв, потом заканчивай день.");
      }

      await updateDoc(dayRef, {
        endAt: serverTimestamp(),
        status: "ended",
        updatedAt: serverTimestamp(),
      });
      await refreshDay();
    } catch (e) {
      setMsg(e?.message || "Ошибка: не удалось завершить день");
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Отметка рабочего дня</h1>
          <p className={styles.subtitle}>Дата: {dateKey}</p>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoGrid}>
            <div className={styles.label}>Имя</div>
            <div className={styles.value}>{profile?.firstName || "-"}</div>

            <div className={styles.label}>Фамилия</div>
            <div className={styles.value}>{profile?.lastName || "-"}</div>

            <div className={styles.label}>E-mail</div>
            <div className={styles.value}>{profile?.email || "-"}</div>

            <div className={styles.label}>Личный номер</div>
            <div className={styles.value}>{profile?.personalNumber || "-"}</div>

            <div className={styles.label}>Статус дня</div>
            <div className={styles.value}>
              {ended
                ? "Завершён"
                : breakStarted && !breakEnded
                ? "Перерыв"
                : started
                ? "Идёт"
                : "Не начат"}
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.actionsGrid}>
          <button
            className={styles.actionButton}
            onClick={startDay}
            disabled={!canStartDay}
            style={{ opacity: canStartDay ? 1 : 0.5 }}
          >
            Начать день
          </button>

          <button
            className={styles.actionButton}
            onClick={startBreak}
            disabled={!canStartBreak}
            style={{ opacity: canStartBreak ? 1 : 0.5 }}
          >
            Начать перерыв
          </button>

          <button
            className={styles.actionButton}
            onClick={endBreak}
            disabled={!canEndBreak}
            style={{ opacity: canEndBreak ? 1 : 0.5 }}
          >
            Завершить перерыв
          </button>

          <button
            className={styles.actionButton}
            onClick={endDay}
            disabled={!canEndDay}
            style={{ opacity: canEndDay ? 1 : 0.5 }}
          >
            Завершить день
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.footer}>
          <Link className={styles.link} href="/worker">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}
