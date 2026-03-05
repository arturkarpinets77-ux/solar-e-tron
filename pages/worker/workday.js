// pages/worker/workday.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import styles from "../../styles/worker.module.css";

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WorkerWorkdayPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);

  const [dayDoc, setDayDoc] = useState(null); // данные текущего дня
  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);

  // Firestore path:
  // Users/{uid}/Workdays/{YYYY-MM-DD}
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
        // профиль нужен, чтобы не пускать неактивных/неворкеров (доп. защита на клиенте)
        const snap = await getDoc(doc(db, "Users", u.uid));
        if (!snap.exists()) {
          router.replace("/login");
          return;
        }
        const data = snap.data() || {};
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard"); // там уже покажет "ожидает активации"
          return;
        }
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

        // загрузим документ дня (если есть)
        if (dayRef) {
          const daySnap = await getDoc(dayRef);
          setDayDoc(daySnap.exists() ? daySnap.data() : null);
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

  // Логика доступности кнопок
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
        if (d.startAt) {
          setMsg("Рабочий день уже начат.");
          return;
        }
        // если документ есть, но startAt нет — обновим
        await updateDoc(dayRef, {
          dateKey,
          startAt: serverTimestamp(),
          status: "started",
          updatedAt: serverTimestamp(),
        });
      } else {
        // создаём документ дня
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
      if (!s.exists()) {
        setMsg("Сначала начни рабочий день.");
        return;
      }
      const d = s.data() || {};
      if (!d.startAt) {
        setMsg("Сначала начни рабочий день.");
        return;
      }
      if (d.endAt) {
        setMsg("День уже завершён.");
        return;
      }
      if (d.breakStartAt) {
        setMsg("Перерыв уже начат.");
        return;
      }

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
      if (!s.exists()) {
        setMsg("Нет активного рабочего дня.");
        return;
      }
      const d = s.data() || {};
      if (!d.breakStartAt) {
        setMsg("Перерыв ещё не начат.");
        return;
      }
      if (d.breakEndAt) {
        setMsg("Перерыв уже завершён.");
        return;
      }
      if (d.endAt) {
        setMsg("День уже завершён.");
        return;
      }

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
      if (!s.exists()) {
        setMsg("Сначала начни рабочий день.");
        return;
      }
      const d = s.data() || {};
      if (!d.startAt) {
        setMsg("Сначала начни рабочий день.");
        return;
      }
      if (d.endAt) {
        setMsg("День уже завершён.");
        return;
      }

      // если перерыв начат, но не завершён — можно запретить закрытие
      if (d.breakStartAt && !d.breakEndAt) {
        setMsg("Сначала заверши перерыв, потом заканчивай день.");
        return;
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

        {/* КНОПКИ */}
        <div className={styles.actionsGrid}>
          <button
            className={styles.actionButton}
            onClick={startDay}
            disabled={!canStartDay}
            style={{ opacity: canStartDay ? 1 : 0.5, cursor: canStartDay ? "pointer" : "not-allowed" }}
          >
            Начать день
          </button>

          <button
            className={styles.actionButton}
            onClick={startBreak}
            disabled={!canStartBreak}
            style={{ opacity: canStartBreak ? 1 : 0.5, cursor: canStartBreak ? "pointer" : "not-allowed" }}
          >
            Начать перерыв
          </button>

          <button
            className={styles.actionButton}
            onClick={endBreak}
            disabled={!canEndBreak}
            style={{ opacity: canEndBreak ? 1 : 0.5, cursor: canEndBreak ? "pointer" : "not-allowed" }}
          >
            Завершить перерыв
          </button>

          <button
            className={styles.actionButton}
            onClick={endDay}
            disabled={!canEndDay}
            style={{ opacity: canEndDay ? 1 : 0.5, cursor: canEndDay ? "pointer" : "not-allowed" }}
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
