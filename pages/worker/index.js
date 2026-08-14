import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import s from "../../styles/worker.module.css";

const WARNING_DAYS = 60;
const DANGER_DAYS = 30;

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

export default function WorkerIndexPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [workerBrigades, setWorkerBrigades] = useState([]);
  const [documentAlerts, setDocumentAlerts] = useState([]);

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

        if (role !== "worker") {
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

        await Promise.all([loadMyBrigades(user.uid), loadMyDocumentAlerts(user.uid)]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета работника");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadMyBrigades(uid) {
    const q = query(
      collection(db, "Brigades"),
      where("memberUids", "array-contains", uid)
    );

    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "ru")
      );

    setWorkerBrigades(list);
  }

  async function loadMyDocumentAlerts(uid) {
    const snap = await getDocs(collection(db, "Users", uid, "Documents"));

    const alerts = snap.docs
      .map((documentSnapshot) => {
        const data = documentSnapshot.data() || {};
        const status = expiryStatus(data.expiresAt || data.expiryDate);

        if (!status) return null;

        return {
          id: documentSnapshot.id,
          title: data.title || data.fileName || "Документ",
          ...status,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.days - b.days;
      });

    setDocumentAlerts(alerts);
  }

  function roleLabel(role) {
    const value = String(role || "").toLowerCase();
    if (value === "worker") return "Работник";
    return role || "-";
  }

  function brigadesLabel() {
    if (!workerBrigades.length) return "Не назначен";

    return workerBrigades
      .map((item) => {
        const brigadeName = String(item.name || item.id || "");
        const objectName = String(item.objectName || item.objectId || "");
        return objectName ? `${brigadeName} → ${objectName}` : brigadeName;
      })
      .join(" | ");
  }

  const hasRedAlerts = documentAlerts.some((item) => item.tone === "red");

  if (loading) {
    return (
      <main className={s.page}>
        <div className={s.card}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Кабинет работника</h1>
            <div className={s.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        {documentAlerts.length ? (
          <Link
            href="/worker/profile"
            style={{
              ...documentAlertStyle,
              borderColor: hasRedAlerts ? "#dc2626" : "#f59e0b",
              background: hasRedAlerts ? "#fef2f2" : "#fff7ed",
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 900 }}>
              Проверь свои документы
            </div>
            <div>Нажми, чтобы открыть профиль.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {documentAlerts.slice(0, 4).map((item) => (
                <span
                  key={item.id}
                  style={{
                    ...documentAlertPillStyle,
                    background: item.tone === "red" ? "#fee2e2" : "#ffedd5",
                    color: item.tone === "red" ? "#991b1b" : "#9a3412",
                  }}
                >
                  {item.title} — {item.label}
                </span>
              ))}
            </div>
          </Link>
        ) : null}

        <div style={infoBoxStyle}>
          <div style={infoRowStyle}>
            <span style={labelStyle}>Имя:</span>
            <span style={valueStyle}>{profile?.firstName || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Фамилия:</span>
            <span style={valueStyle}>{profile?.lastName || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>E-mail:</span>
            <span style={valueStyle}>{profile?.email || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Личный номер:</span>
            <span style={valueStyle}>{profile?.personalNumber || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Роль:</span>
            <span style={valueStyle}>{roleLabel(profile?.role)}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Статус:</span>
            <span style={valueStyle}>{profile?.status || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Бригады:</span>
            <span style={valueStyle}>{brigadesLabel()}</span>
          </div>
        </div>

        <div style={menuGridStyle}>
          <Link href="/worker/workday" className={s.actionButton} style={menuBtnStyle}>
            Отметка рабочего дня
          </Link>

          <Link href="/worker/objects" className={s.actionButton} style={menuBtnStyle}>
            Объекты
          </Link>

          <Link href="/worker/photo" className={s.actionButton} style={menuBtnStyle}>
            Добавить фотоотчёт
          </Link>

          <Link href="/worker/construction-reports" className={s.actionButton} style={menuBtnStyle}>
            Отчёт по конструкциям
          </Link>

          <Link href="/worker/construction-reports-history" className={s.actionButton} style={menuBtnStyle}>
            Мои отчёты по конструкциям
          </Link>

          <Link href="/worker/history" className={s.actionButton} style={menuBtnStyle}>
            История рабочего времени
          </Link>

          <Link href="/worker/profile" className={s.actionButton} style={menuBtnStyle}>
            Мой профиль
          </Link>
        </div>

        {msg ? <div style={msgStyle}>{msg}</div> : null}

        <div style={footerStyle}>
          <button type="button" onClick={() => signOut(auth)} style={footerBtnStyle}>
            Выйти
          </button>

          <Link href="/">На главную</Link>
        </div>
      </div>
    </main>
  );
}

const documentAlertStyle = {
  display: "grid",
  gap: 7,
  marginTop: 14,
  marginBottom: 14,
  padding: 14,
  borderRadius: 16,
  border: "2px solid",
  textDecoration: "none",
};

const documentAlertPillStyle = {
  padding: "6px 9px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
};

const infoBoxStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
  marginTop: 12,
};

const infoRowStyle = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 10,
  marginBottom: 8,
  alignItems: "start",
};

const labelStyle = { fontWeight: 700 };

const valueStyle = { wordBreak: "break-word" };

const menuGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const menuBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 64,
  textAlign: "center",
  textDecoration: "none",
};

const msgStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const footerStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 16,
};

const footerBtnStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#1d4ed8",
  cursor: "pointer",
  font: "inherit",
};
