import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import {
  DEFAULT_BREAK_MINUTES,
  formatMinutes,
  getMonthKey,
  monthLabel,
  normalizeWorkday,
  sortWorkdaysDesc,
} from "../../lib/workdayUtils";

function roleLabel(role) {
  const value = String(role || "").toLowerCase();

  if (value === "worker") return "Работник";
  if (value === "director") return "Директор";
  if (value === "admin") return "Администратор";
  if (value === "accountant") return "Бухгалтер";

  return role || "-";
}

function userDisplayName(user) {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const personal = user.personalNumber ? ` — ${user.personalNumber}` : "";
  const role = user.role ? ` — ${roleLabel(user.role)}` : "";
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
      .filter((u) => {
        const status = String(u.status || "").toLowerCase();
        const role = String(u.role || "").toLowerCase();

        return (
          status === "active" &&
          (role === "worker" || role === "director" || role === "admin")
        );
      })
      .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b), "ru"));

    setUsers(list);
    setSelectedUid("");
    setAllDays([]);
    setSelectedMonth("");
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
      )
        .sort()
        .reverse();

      setSelectedMonth(months[0] || "");
    } catch (e) {
      setAllDays([]);
      setSelectedMonth("");
      setMsg(e?.message || "Ошибка загрузки рабочих дней");
    }
  }

  async function handleSelectUser(uid) {
    setSelectedUid(uid);
    await loadWorkdays(uid);
  }

  function backToUsers() {
    setSelectedUid("");
    setAllDays([]);
    setSelectedMonth("");
    setMsg("");
  }

  function exportCsv() {
    if (!selectedUser) return;

    const lines = [
      [
        "Дата",
        "Статус",
        "Объект",
        "Начало",
        "Перерыв начало",
        "Перерыв конец",
        "Конец",
        "Итого минут",
        "Итого",
      ].join(";"),
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
    a.download = `workdays-${
      selectedUser?.personalNumber || selectedUid
    }-${selectedMonth || "all"}.csv`;
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

        {!selectedUser ? (
          <>
            <div style={boxStyle}>
              <h2 style={sectionTitleStyle}>Список работников</h2>

              {users.length === 0 ? (
                <div style={emptyStyle}>Работников пока нет</div>
              ) : (
                <div style={usersGridStyle}>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUser(u.id)}
                      style={userButtonStyle}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {`${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                          u.email ||
                          u.id}
                      </div>

                      <div style={{ opacity: 0.8 }}>
                        Личный номер: {u.personalNumber || "-"}
                      </div>

                      <div style={{ opacity: 0.8 }}>
                        Роль: {roleLabel(u.role)}
                      </div>

                      <div style={{ opacity: 0.8 }}>
                        E-mail: {u.email || "-"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {msg ? <div style={msgStyle}>{msg}</div> : null}

            <div style={{ marginTop: 16 }}>
              <Link href="/" style={linkStyle}>
                На главную
              </Link>
            </div>
          </>
        ) : (
          <>
            <div style={boxStyle}>
              <div style={grid2Style}>
                <div>
                  <div style={labelStyle}>Работник</div>
                  <select
                    value={selectedUid}
                    onChange={(e) => handleSelectUser(e.target.value)}
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
                    {monthOptions.length === 0 ? (
                      <option value="">Нет месяцев</option>
                    ) : (
                      monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14, color: "#111827" }}>
                <b>Выбран:</b> {userDisplayName(selectedUser)}
              </div>

              <div style={buttonsStyle}>
                <button type="button" onClick={backToUsers} style={buttonStyle}>
                  Вернуться ко всем
                </button>

                <button type="button" onClick={exportCsv} style={buttonStyle}>
                  Экспорт CSV
                </button>

                <button type="button" onClick={() => window.print()} style={buttonStyle}>
                  Экспорт PDF
                </button>
              </div>
            </div>

            {msg ? <div style={msgStyle}>{msg}</div> : null}

            <h2 style={sectionTitleStyle}>Рабочие дни</h2>

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

                    <div>
                      <b>Объект:</b> {d.objectName || "-"}
                    </div>

                    <div>
                      <b>Начало:</b> {d.startText}
                    </div>

                    <div>
                      <b>Перерыв:</b> {d.breakStartText} - {d.breakEndText}
                    </div>

                    <div>
                      <b>Конец:</b> {d.endText}
                    </div>

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

            <h2 style={sectionTitleStyle}>
              Итого за месяц: {formatMinutes(totalMonthMinutes)}
            </h2>

            <div style={{ marginTop: 16 }}>
              <Link href="/" style={linkStyle}>
                На главную
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 20,
  color: "#111827",
};

const cardStyle = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
  borderRadius: 24,
  background: "rgba(255,255,255,0.88)",
  color: "#111827",
};

const titleStyle = {
  marginTop: 0,
  color: "#111827",
  fontWeight: 800,
};

const sectionTitleStyle = {
  marginTop: 0,
  marginBottom: 16,
  color: "#111827",
  fontWeight: 800,
};

const boxStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
  color: "#111827",
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const labelStyle = {
  fontWeight: 700,
  marginBottom: 6,
  color: "#111827",
};

const inputStyle = {
  width: "100%",
  minHeight: 46,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.14)",
  background: "#fff",
  padding: "0 12px",
  color: "#111827",
};

const usersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const userButtonStyle = {
  textAlign: "left",
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  cursor: "pointer",
  display: "grid",
  gap: 6,
};

const emptyStyle = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
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
  background: "rgba(255,255,255,0.95)",
  color: "#111827",
  cursor: "pointer",
};

const msgStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,245,230,0.95)",
  color: "#111827",
};

const dayStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.86)",
  border: "1px solid rgba(15,23,42,0.08)",
  color: "#111827",
};

const topRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 8,
  color: "#111827",
};

const linkStyle = {
  color: "#1d4ed8",
  fontWeight: 700,
};
