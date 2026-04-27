import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import s from "../../styles/worker.module.css";
import {
  DEFAULT_BREAK_MINUTES,
  normalizeWorkday,
  sortWorkdaysDesc,
} from "../../lib/workdayUtils";

export default function WorkerHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [days, setDays] = useState([]);

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
        const userSnap = await getDoc(doc(db, "Users", user.uid));
        if (!userSnap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const userData = userSnap.data() || {};
        const role = String(userData.role || "").toLowerCase();
        const status = String(userData.status || "").toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "worker") {
          router.replace("/dashboard");
          return;
        }

        const snap = await getDocs(collection(db, "Users", user.uid, "Workdays"));

        const list = snap.docs
          .map((d) => normalizeWorkday(d.id, d.data()))
          .sort(sortWorkdaysDesc)
          .slice(0, 31);

        setDays(list);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки истории рабочего времени");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

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
            <h1 className={s.title}>История рабочего времени</h1>
            <div className={s.subtitle}>Последние 31 день</div>
          </div>
        </div>

        {msg ? <div style={msgStyle}>{msg}</div> : null}

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {days.length === 0 ? (
            <div style={emptyStyle}>Записей пока нет</div>
          ) : (
            days.map((day) => (
              <div key={day.id} style={dayCardStyle}>
                <div style={topRowStyle}>
                  <b>{day.dateKey}</b>
                  <span>{day.statusText}</span>
                </div>

                <div style={rowStyle}>
                  <span>Объект</span>
                  <b>{day.objectName || "-"}</b>
                </div>

                <div style={rowStyle}>
                  <span>Начало</span>
                  <b>{day.startText}</b>
                </div>

                <div style={rowStyle}>
                  <span>Перерыв</span>
                  <b>
                    {day.breakStartText} - {day.breakEndText}
                  </b>
                </div>

                <div style={rowStyle}>
                  <span>Конец</span>
                  <b>{day.endText}</b>
                </div>

                <div style={rowStyle}>
                  <span>Итого</span>
                  <b>
                    {day.endText !== "-"
                      ? `${day.totalText} (обед ${DEFAULT_BREAK_MINUTES} мин по умолчанию)`
                      : "-"}
                  </b>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={footerStyle}>
          <Link href="/worker">← Назад</Link>
        </div>
      </div>
    </main>
  );
}

const msgStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const emptyStyle = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const dayCardStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const topRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
  fontSize: 18,
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  marginBottom: 8,
};

const footerStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 18,
};
