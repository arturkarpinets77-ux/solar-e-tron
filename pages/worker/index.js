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

export default function WorkerIndexPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [brigadeName, setBrigadeName] = useState("");

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

        await loadMyBrigade(user.uid);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета работника");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadMyBrigade(uid) {
    const q = query(
      collection(db, "Brigades"),
      where("memberUids", "array-contains", uid)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      setBrigadeName("");
      return;
    }

    const first = snap.docs[0].data() || {};
    setBrigadeName(String(first.name || ""));
  }

  function roleLabel(role) {
    const value = String(role || "").toLowerCase();
    if (value === "worker") return "Работник";
    return role || "-";
  }

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
            <span style={labelStyle}>Бригада:</span>
            <span style={valueStyle}>{brigadeName || "Не назначен"}</span>
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

          <Link
            href="/worker/construction-reports"
            className={s.actionButton}
            style={menuBtnStyle}
          >
            Отчёт по конструкциям
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
          <button
            type="button"
            onClick={() => signOut(auth)}
            style={footerBtnStyle}
          >
            Выйти
          </button>

          <Link href="/">На главную</Link>
        </div>
      </div>
    </main>
  );
}

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

const labelStyle = {
  fontWeight: 700,
};

const valueStyle = {
  wordBreak: "break-word",
};

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
