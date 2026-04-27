import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import {
  DEFAULT_BREAK_MINUTES,
  formatMinutes,
  getMonthKey,
  monthLabel,
  normalizeWorkday,
  sortWorkdaysDesc,
} from "../lib/workdayUtils";

function userDisplayName(user) {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const personal = user.personalNumber ? ` — ${user.personalNumber}` : "";
  const role = user.role ? ` — ${user.role}` : "";
  return `${name || user.email || user.id}${personal}${role}`;
}

export default function AccountantPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [allDays, setAllDays] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  const selectedUser = users.find((u) => u.id === selectedUid) || null;

  const monthOptions = useMemo(() => {
    const set = new Set(allDays.map((d) => getMonthKey(d.dateKey)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [allDays]);

  const visibleDays = useMemo(() => {
    return allDays
      .filter((d) => !selectedMonth || getMonthKey(d.dateKey) === selectedMonth)
      .sort(sortWorkdaysDesc);
  }, [allDays, selectedMonth]);

  const totalMonthMinutes = useMemo(() => {
    return visibleDays.reduce((sum, d) => sum + Number(d.totalMinutes || 0), 0);
  }, [visibleDays]);

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
        const snap = await getDoc(doc(db, "Users", user.uid));
        if (!snap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const data = snap.data() || {};
        const role = String(data.role || "").toLowerCase();
        const status = String(data.status || "").toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "accountant" && role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        await loadUsers();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета бухгалтера");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadUsers() {
    const snap = await getDocs(collection(db, "Users"));

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.status || "").toLowerCase() === "active")
      .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b), "ru"));

    setUsers(list);

    if (list.length > 0) {
      setSelectedUid(list[0].id);
      await loadWorkdays(list[0].id);
    }
  }

  async function loadWorkdays(uid) {
    setMsg("");

    try {
      const snap = await getDocs(collection(db, "Users", uid, "Workdays"));

      const list = snap.docs
        .map((d) => normalizeWorkday(d.id, d.data()))
        .sort(sortWorkdaysDesc);

      setAllDays(list);

      const months = Array.from(
        new Set(list.map((d) => getMonthKey(d.dateKey)).filter(Boolean))
      ).sort().reverse();

      setSelectedMonth(months[0] || "");
    } catch (e) {
      setAllDays([]);
      setMsg(e?.message || "Ошибка загрузки рабочих дней");
    }
  }

  async function handleUserChange(uid) {
    setSelectedUid(uid);
    await loadWorkdays(uid);
  }

  function exportCsv() {
    const lines = [
      ["Дата", "Статус", "Объект", "Начало", "Перерыв начало", "Перерыв конец", "Конец", "Итого минут", "Итого"].join(";"),
      ...visibleDays.map((d) =>
        [
          d.dateKey,
          d.statusText,
          d.objectName || "",
          d.startText,
          d.breakStartText,
          d.breakEndText,
          d.endText,
          d.totalMinutes,
          d.totalText,
        ].join(";")
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workdays-${selectedUser?.personalNumber || selectedUid}-${selectedMonth || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>Загрузка...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Просмотр рабочего времени сотрудников</h1>

        <div style={boxStyle}>
          <div style={grid2Style}>
            <div>
              <div style={labelStyle}>Работник</div>
              <select
                value={selectedUid}
                onChange={(e) => handleUserChange(e.target.value)}
                style={inputStyle}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userDisplayName(u)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Месяц</div>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={inputStyle}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <b>Выбран:</b> {selectedUser ? userDisplayName(selectedUser) : "-"}
          </div>

          <div style={buttonsStyle}>
            <button type="button" onClick={exportCsv} style={buttonStyle}>
              Экспорт CSV
            </button>

            <button type="button" onClick={() => window.print()} style={buttonStyle}>
              Экспорт PDF
            </button>
          </div>
        </div>

        {msg ? <div style={msgStyle}>{msg}</div> : null}

        <h2 style={{ marginTop: 22 }}>Рабочие дни</h2>

        <div style={{ display: "grid", gap: 12 }}>
          {visibleDays.length === 0 ? (
            <div style={boxStyle}>Записей нет</div>
          ) : (
            visibleDays.map((d) => (
              <div key={d.id} style={dayStyle}>
                <div style={topRowStyle}>
                  <b>{d.dateKey}</b>
                  <span>{d.statusText}</span>
                </div>

                <div><b>Объект:</b> {d.objectName || "-"}</div>
                <div><b>Начало:</b> {d.startText}</div>
                <div><b>Перерыв:</b> {d.breakStartText} - {d.breakEndText}</div>
                <div><b>Конец:</b> {d.endText}</div>
                <div>
                  <b>Итого:</b>{" "}
                  {d.endText !== "-"
                    ? `${d.totalText} (перерыв ${DEFAULT_BREAK_MINUTES} мин по умолчанию)`
                    : "-"}
                </div>
              </div>
            ))
          )}
        </div>

        <h2 style={{ marginTop: 22 }}>
          Итого за месяц: {formatMinutes(totalMonthMinutes)}
        </h2>

        <div style={{ marginTop: 16 }}>
          <Link href="/">На главную</Link>
        </div>
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 20,
};

const cardStyle = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
  borderRadius: 24,
  background: "rgba(255,255,255,0.82)",
};

const titleStyle = {
  marginTop: 0,
};

const boxStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const labelStyle = {
  fontWeight: 700,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  minHeight: 46,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.14)",
  background: "#fff",
  padding: "0 12px",
};

const buttonsStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 16,
};

const buttonStyle = {
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
};

const msgStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,245,230,0.9)",
};

const dayStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const topRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 8,
};
