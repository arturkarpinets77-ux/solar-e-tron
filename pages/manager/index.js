import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

const WARNING_DAYS = 60;
const DANGER_DAYS = 30;

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNowTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function dateFromValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(`${value}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function daysUntilExpiry(value) {
  const target = dateFromValue(value);
  if (!target) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetEnd = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    23,
    59,
    59
  );

  return Math.ceil((targetEnd.getTime() - todayStart.getTime()) / 86400000) - 1;
}

function expiryStatus(value) {
  const days = daysUntilExpiry(value);
  if (days === null) return null;
  if (days < 0) {
    return {
      tone: "red",
      priority: 0,
      days,
      label: `Просрочен на ${Math.abs(days)} дн.`,
    };
  }
  if (days <= DANGER_DAYS) {
    return {
      tone: "red",
      priority: 1,
      days,
      label: days === 0 ? "Истекает сегодня" : `Осталось ${days} дн.`,
    };
  }
  if (days <= WARNING_DAYS) {
    return {
      tone: "orange",
      priority: 2,
      days,
      label: `Осталось ${days} дн.`,
    };
  }
  return null;
}

function roleLabel(role) {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "Администратор";
  if (value === "director") return "Директор";
  return role || "-";
}

function dayStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "started") return "В работе";
  if (value === "ended") return "Завершён";
  return "Не начат";
}

function workerName(worker) {
  return (
    `${worker.firstName || ""} ${worker.lastName || ""}`.trim() ||
    worker.email ||
    worker.personalNumber ||
    worker.id
  );
}

export default function ManagerIndexPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [todayWorkday, setTodayWorkday] = useState(null);
  const [saving, setSaving] = useState(false);
  const [documentAlerts, setDocumentAlerts] = useState([]);

  const todayKey = useMemo(() => getTodayKey(), []);

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setMsg("");

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const userRef = doc(db, "Users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const data = userSnap.data() || {};
        const role = String(data.role || "").toLowerCase();
        const status = String(data.status || "").toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          uid: user.uid,
          firstName: String(data.firstName || ""),
          lastName: String(data.lastName || ""),
          email: String(data.email || user.email || ""),
          personalNumber: String(data.personalNumber || ""),
          role,
          status,
        });

        await Promise.all([
          loadTodayWorkday(user.uid, todayKey),
          loadDocumentAlerts(),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета директора");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, todayKey]);

  async function loadTodayWorkday(uid, dateKey) {
    const ref = doc(db, "Users", uid, "Workdays", dateKey);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setTodayWorkday(null);
      return;
    }

    setTodayWorkday({ id: snap.id, ...snap.data() });
  }

  async function loadDocumentAlerts() {
    const usersSnap = await getDocs(collection(db, "Users"));

    const workers = usersSnap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.role || "").toLowerCase() === "worker");

    const alerts = [];

    for (const worker of workers) {
      const docsSnap = await getDocs(collection(db, "Users", worker.id, "Documents"));

      docsSnap.docs.forEach((documentSnapshot) => {
        const documentData = documentSnapshot.data() || {};
        const expiryValue = documentData.expiresAt || documentData.expiryDate;
        const status = expiryStatus(expiryValue);

        if (!status) return;

        alerts.push({
          id: documentSnapshot.id,
          workerId: worker.id,
          workerName: workerName(worker),
          title: documentData.title || documentData.fileName || "Документ",
          expiryValue,
          ...status,
        });
      });
    }

    alerts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.days - b.days;
    });

    setDocumentAlerts(alerts);
  }

  async function handleStartDay() {
    if (!profile?.uid) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          date: todayKey,
          status: "started",
          startTime: getNowTime(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Рабочий день начат.");
    } catch (e) {
      setMsg(e?.message || "Ошибка начала рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndDay() {
    if (!profile?.uid) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await updateDoc(ref, {
        status: "ended",
        endTime: getNowTime(),
        updatedAt: serverTimestamp(),
      });

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Рабочий день завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка завершения рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  const canStart = !todayWorkday || String(todayWorkday.status || "") !== "started";
  const canEnd = !!todayWorkday && String(todayWorkday.status || "") === "started";

  const redAlertsCount = documentAlerts.filter((item) => item.tone === "red").length;
  const orangeAlertsCount = documentAlerts.filter((item) => item.tone === "orange").length;
  const hasDocumentAlerts = documentAlerts.length > 0;

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${typo.base}`}>
        <div className={styles.header}>
          <div>
            <div className={`${styles.title} ${typo.title}`}>Кабинет директора</div>
            <div className={styles.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        {hasDocumentAlerts ? (
          <Link
            href="/manager/documents"
            style={{
              ...documentAlertStyle,
              borderColor: redAlertsCount ? "#dc2626" : "#f59e0b",
              background: redAlertsCount ? "#fef2f2" : "#fff7ed",
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Документы работников требуют внимания
            </div>
            <div>
              Красных: <b>{redAlertsCount}</b>, оранжевых: <b>{orangeAlertsCount}</b>. Нажми, чтобы открыть список.
            </div>
            <div style={documentAlertListStyle}>
              {documentAlerts.slice(0, 5).map((item) => (
                <span
                  key={`${item.workerId}-${item.id}`}
                  style={{
                    ...documentAlertPillStyle,
                    background: item.tone === "red" ? "#fee2e2" : "#ffedd5",
                    color: item.tone === "red" ? "#991b1b" : "#9a3412",
                  }}
                >
                  {item.workerName}: {item.title} — {item.label}
                </span>
              ))}
            </div>
          </Link>
        ) : null}

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Имя:</span>
            <span className={styles.value}>{profile?.firstName || "-"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Фамилия:</span>
            <span className={styles.value}>{profile?.lastName || "-"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>E-mail:</span>
            <span className={styles.value}>{profile?.email || "-"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Личный номер:</span>
            <span className={styles.value}>{profile?.personalNumber || "-"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Роль:</span>
            <span className={styles.value}>{roleLabel(profile?.role)}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Статус:</span>
            <span className={styles.value}>{profile?.status || "-"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Статус дня:</span>
            <span className={styles.value}>{dayStatusLabel(todayWorkday?.status)}</span>
          </div>
        </div>

        <div style={menuGridStyle}>
          <Link href="/admin/users" className={styles.actionButton} style={menuBtnStyle}>
            Пользователи
          </Link>

          <Link href="/manager/objects" className={styles.actionButton} style={menuBtnStyle}>
            Объекты
          </Link>

          <Link href="/manager/brigades" className={styles.actionButton} style={menuBtnStyle}>
            Бригады
          </Link>

          <Link href="/manager/construction-reports" className={styles.actionButton} style={menuBtnStyle}>
            Отчёты по конструкциям
          </Link>

          <Link href="/manager/documents" className={styles.actionButton} style={menuBtnStyle}>
            Документы работников
          </Link>

          <Link href="/manager/workdays" className={styles.actionButton} style={menuBtnStyle}>
            Рабочее время работников
          </Link>

          <Link href="/manager/object-calculator" className={styles.actionButton} style={menuBtnStyle}>
            Калькулятор объекта
          </Link>
        </div>

        <div style={menuGridStyle}>
          <button
            type="button"
            onClick={handleStartDay}
            disabled={!canStart || saving}
            className={styles.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canStart || saving ? 0.55 : 1,
              cursor: !canStart || saving ? "not-allowed" : "pointer",
            }}
          >
            Начать рабочий день
          </button>

          <button
            type="button"
            onClick={handleEndDay}
            disabled={!canEnd || saving}
            className={styles.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canEnd || saving ? 0.55 : 1,
              cursor: !canEnd || saving ? "not-allowed" : "pointer",
            }}
          >
            Завершить рабочий день
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.footer}>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className={styles.link}
            style={footerBtnStyle}
          >
            Выйти
          </button>

          <Link className={styles.link} href="/">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}

const documentAlertStyle = {
  display: "grid",
  gap: 8,
  marginTop: 14,
  marginBottom: 14,
  padding: 14,
  borderRadius: 16,
  border: "2px solid",
  textDecoration: "none",
};

const documentAlertListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const documentAlertPillStyle = {
  padding: "6px 9px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
};

const menuGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const menuBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 56,
  textAlign: "center",
  textDecoration: "none",
};

const footerBtnStyle = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};
