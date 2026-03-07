// pages/accountant/index.js
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
  orderBy,
  query,
} from "firebase/firestore";

import styles from "../../styles/accountant.module.css";
import typo from "../../styles/typography.module.css";

const DEFAULT_BREAK_MINUTES = 30;
const ALL_VALUE = "__all__";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toTime(ts) {
  if (!ts) return "-";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch {
    return "-";
  }
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  try {
    const da = a.toDate ? a.toDate() : new Date(a);
    const db = b.toDate ? b.toDate() : new Date(b);
    return Math.max(0, Math.round((db - da) / 60000));
  } catch {
    return 0;
  }
}

function fmtHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}ч ${pad2(m)}м`;
}

function statusLabel(d) {
  const ended = !!d?.endAt;
  const started = !!d?.startAt;
  const bS = !!d?.breakStartAt;
  const bE = !!d?.breakEndAt;

  if (ended) return "Завершён";
  if (bS && !bE) return "Перерыв";
  if (started) return "Идёт";
  return "Не начат";
}

function monthValueFromDate(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function fullName(u) {
  return (
    `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
    `${u.name || ""} ${u.surname || ""}`.trim() ||
    u.email ||
    "-"
  );
}

function calcNetMinutes(d) {
  const start = d.startAt;
  const end = d.endAt;
  const bS = d.breakStartAt;
  const bE = d.breakEndAt;

  const total = minutesBetween(start, end);
  const brActual = minutesBetween(bS, bE);

  const noBreakMarked = !bS && !bE;
  const shouldApplyDefault = !!end && noBreakMarked;

  const br = shouldApplyDefault ? DEFAULT_BREAK_MINUTES : brActual;
  const net = Math.max(0, total - br);

  return {
    total,
    br,
    net,
    shouldApplyDefault,
  };
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function AccountantPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [people, setPeople] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState(ALL_VALUE);
  const [monthValue, setMonthValue] = useState(monthValueFromDate());

  const [rows, setRows] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const selectedPerson = useMemo(
    () => people.find((w) => w.id === selectedWorkerId) || null,
    [people, selectedWorkerId]
  );

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setMsg("");
      setLoading(true);

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

        if (role !== "accountant") {
          router.replace("/dashboard");
          return;
        }

        setProfile({
          uid: user.uid,
          role,
          status,
          email: String(data.email || user.email || "").trim(),
        });

        await loadPeople();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета бухгалтера");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadPeople() {
    if (!db) return;

    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        const role = String(u.role || "").toLowerCase();
        return role === "worker" || role === "director";
      })
      .filter((u) => String(u.status || "").toLowerCase() === "active")
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));

    setPeople(list);
  }

  async function loadWorkdays(workerUid, monthStr) {
    if (!db || !workerUid || !monthStr) {
      setRows([]);
      return;
    }

    setRowsLoading(true);
    setMsg("");

    try {
      const q = query(
        collection(db, "Users", workerUid, "Workdays"),
        orderBy("dateKey", "desc")
      );

      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((item) =>
        String(item.dateKey || "").startsWith(monthStr)
      );

      setRows(filtered);
      setSummaryRows([]);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки рабочего времени");
    } finally {
      setRowsLoading(false);
    }
  }

  async function loadSummaryForAll(monthStr) {
    if (!db || !monthStr) {
      setSummaryRows([]);
      return;
    }

    setRowsLoading(true);
    setMsg("");

    try {
      const result = [];

      for (const person of people) {
        const q = query(
          collection(db, "Users", person.id, "Workdays"),
          orderBy("dateKey", "desc")
        );

        const snap = await getDocs(q);
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = all.filter((item) =>
          String(item.dateKey || "").startsWith(monthStr)
        );

        let workedDays = 0;
        let totalMinutes = 0;

        filtered.forEach((d) => {
          const calc = calcNetMinutes(d);
          if (d.startAt && d.endAt) {
            workedDays += 1;
            totalMinutes += calc.net;
          }
        });

        result.push({
          id: person.id,
          name: fullName(person),
          personalNumber: person.personalNumber || "-",
          role: String(person.role || "").toLowerCase(),
          workedDays,
          totalMinutes,
        });
      }

      result.sort((a, b) => a.name.localeCompare(b.name));

      setSummaryRows(result);
      setRows([]);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки сводки");
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    if (!monthValue) {
      setRows([]);
      setSummaryRows([]);
      return;
    }

    if (selectedWorkerId === ALL_VALUE) {
      if (people.length) {
        loadSummaryForAll(monthValue);
      } else {
        setSummaryRows([]);
        setRows([]);
      }
      return;
    }

    if (!selectedWorkerId) {
      setRows([]);
      setSummaryRows([]);
      return;
    }

    loadWorkdays(selectedWorkerId, monthValue);
  }, [selectedWorkerId, monthValue, people]);

  const totalMinutes = useMemo(() => {
    if (selectedWorkerId === ALL_VALUE) {
      return summaryRows.reduce((sum, r) => sum + r.totalMinutes, 0);
    }

    return rows.reduce((sum, d) => {
      const calc = calcNetMinutes(d);
      return sum + calc.net;
    }, 0);
  }, [rows, summaryRows, selectedWorkerId]);

  function exportCsv() {
    try {
      if (selectedWorkerId === ALL_VALUE) {
        const header = [
          "Имя",
          "Личный номер",
          "Роль",
          "Отработано дней",
          "Отработано часов",
        ];

        const lines = [
          header.map(csvEscape).join(";"),
          ...summaryRows.map((r) =>
            [
              r.name,
              r.personalNumber,
              r.role,
              r.workedDays,
              fmtHM(r.totalMinutes),
            ]
              .map(csvEscape)
              .join(";")
          ),
        ];

        downloadTextFile(
          `accountant_all_${monthValue}.csv`,
          "\uFEFF" + lines.join("\n"),
          "text/csv;charset=utf-8;"
        );
        return;
      }

      const workerName = selectedPerson ? fullName(selectedPerson) : "Работник";
      const header = [
        "Дата",
        "Статус",
        "Объект",
        "Начало",
        "Перерыв начало",
        "Перерыв конец",
        "Конец",
        "Итого",
      ];

      const lines = [
        [workerName, selectedPerson?.personalNumber || "-", selectedPerson?.role || "-", monthValue]
          .map(csvEscape)
          .join(";"),
        header.map(csvEscape).join(";"),
        ...rows.map((d) => {
          const calc = calcNetMinutes(d);
          return [
            d.dateKey || d.id,
            statusLabel(d),
            d.objectName || "-",
            toTime(d.startAt),
            toTime(d.breakStartAt),
            toTime(d.breakEndAt),
            toTime(d.endAt),
            d.endAt ? fmtHM(calc.net) : "-",
          ]
            .map(csvEscape)
            .join(";");
        }),
        [
          csvEscape("Итого за месяц"),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(fmtHM(totalMinutes)),
        ].join(";"),
      ];

      downloadTextFile(
        `accountant_${selectedWorkerId}_${monthValue}.csv`,
        "\uFEFF" + lines.join("\n"),
        "text/csv;charset=utf-8;"
      );
    } catch (e) {
      setMsg(e?.message || "Ошибка экспорта CSV");
    }
  }

  function exportPdf() {
    try {
      const printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) {
        setMsg("Браузер заблокировал окно печати.");
        return;
      }

      let title = "";
      let bodyHtml = "";

      if (selectedWorkerId === ALL_VALUE) {
        title = `Сводка по всем сотрудникам за ${monthValue}`;
        bodyHtml = `
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Личный номер</th>
                <th>Роль</th>
                <th>Отработано дней</th>
                <th>Отработано часов</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows
                .map(
                  (r) => `
                    <tr>
                      <td>${htmlEscape(r.name)}</td>
                      <td>${htmlEscape(r.personalNumber)}</td>
                      <td>${htmlEscape(r.role)}</td>
                      <td>${htmlEscape(r.workedDays)}</td>
                      <td>${htmlEscape(fmtHM(r.totalMinutes))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        `;
      } else {
        const workerName = selectedPerson ? fullName(selectedPerson) : "Работник";
        title = `Отчёт по сотруднику: ${workerName} (${monthValue})`;

        bodyHtml = `
          <div class="meta">
            <div><b>Сотрудник:</b> ${htmlEscape(workerName)}</div>
            <div><b>Личный номер:</b> ${htmlEscape(selectedPerson?.personalNumber || "-")}</div>
            <div><b>Роль:</b> ${htmlEscape(selectedPerson?.role || "-")}</div>
            <div><b>Месяц:</b> ${htmlEscape(monthValue)}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Статус</th>
                <th>Объект</th>
                <th>Начало</th>
                <th>Перерыв</th>
                <th>Конец</th>
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((d) => {
                  const calc = calcNetMinutes(d);
                  return `
                    <tr>
                      <td>${htmlEscape(d.dateKey || d.id)}</td>
                      <td>${htmlEscape(statusLabel(d))}</td>
                      <td>${htmlEscape(d.objectName || "-")}</td>
                      <td>${htmlEscape(toTime(d.startAt))}</td>
                      <td>${htmlEscape(`${toTime(d.breakStartAt)} – ${toTime(d.breakEndAt)}`)}</td>
                      <td>${htmlEscape(toTime(d.endAt))}</td>
                      <td>${htmlEscape(d.endAt ? fmtHM(calc.net) : "-")}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>

          <div class="total">
            <b>Итого за месяц:</b> ${htmlEscape(fmtHM(totalMinutes))}
          </div>
        `;
      }

      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html lang="ru">
          <head>
            <meta charset="utf-8" />
            <title>${htmlEscape(title)}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 24px;
                color: #111827;
              }
              h1 {
                font-size: 22px;
                margin-bottom: 16px;
              }
              .meta {
                margin-bottom: 16px;
                display: grid;
                gap: 6px;
              }
              .total {
                margin-top: 18px;
                font-size: 18px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 12px;
              }
              th, td {
                border: 1px solid #d1d5db;
                padding: 8px 10px;
                text-align: left;
                vertical-align: top;
                font-size: 14px;
              }
              th {
                background: #f3f4f6;
              }
            </style>
          </head>
          <body>
            <h1>${htmlEscape(title)}</h1>
            ${bodyHtml}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
      }, 300);
    } catch (e) {
      setMsg(e?.message || "Ошибка экспорта PDF");
    }
  }

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
            <div className={`${styles.title} ${typo.title}`}>
              Кабинет бухгалтера
            </div>
            <div className={styles.subtitle}>
              Просмотр рабочего времени сотрудников
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Работник:</span>
            <span className={styles.value}>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                style={inputStyle}
              >
                <option value={ALL_VALUE}>Все</option>
                {people.map((w) => (
                  <option key={w.id} value={w.id}>
                    {fullName(w)}
                    {w.personalNumber ? ` — ${w.personalNumber}` : ""}
                    {w.role ? ` — ${String(w.role).toLowerCase()}` : ""}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Месяц:</span>
            <span className={styles.value}>
              <input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                style={inputStyle}
              />
            </span>
          </div>

          {selectedWorkerId === ALL_VALUE ? (
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              <b>Режим:</b> сводка по всем работникам и директору
            </div>
          ) : selectedPerson ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ opacity: 0.8 }}>
                <b>Выбран:</b> {fullName(selectedPerson)}
                {selectedPerson.personalNumber
                  ? ` — ${selectedPerson.personalNumber}`
                  : ""}
                {selectedPerson.role
                  ? ` — ${String(selectedPerson.role).toLowerCase()}`
                  : ""}
              </div>

              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setSelectedWorkerId(ALL_VALUE)}
              >
                Вернуться ко всем
              </button>
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={exportCsv}
            disabled={
              rowsLoading ||
              (selectedWorkerId === ALL_VALUE ? summaryRows.length === 0 : rows.length === 0)
            }
            style={{
              opacity:
                rowsLoading ||
                (selectedWorkerId === ALL_VALUE ? summaryRows.length === 0 : rows.length === 0)
                  ? 0.6
                  : 1,
            }}
          >
            Экспорт CSV
          </button>

          <button
            type="button"
            className={styles.btnSecondary}
            onClick={exportPdf}
            disabled={
              rowsLoading ||
              (selectedWorkerId === ALL_VALUE ? summaryRows.length === 0 : rows.length === 0)
            }
            style={{
              opacity:
                rowsLoading ||
                (selectedWorkerId === ALL_VALUE ? summaryRows.length === 0 : rows.length === 0)
                  ? 0.6
                  : 1,
            }}
          >
            Экспорт PDF
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          {selectedWorkerId === ALL_VALUE ? "Сводка по всем" : "Рабочие дни"}
        </div>

        {rowsLoading ? (
          <div style={{ opacity: 0.7 }}>Загрузка данных...</div>
        ) : selectedWorkerId === ALL_VALUE ? (
          summaryRows.length === 0 ? (
            <div style={{ opacity: 0.7 }}>За выбранный месяц записей нет</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {summaryRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedWorkerId(r.id)}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "rgba(255,255,255,0.85)",
                    padding: 14,
                    display: "grid",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{r.name}</div>
                  <div><b>Личный номер:</b> {r.personalNumber}</div>
                  <div><b>Роль:</b> {r.role}</div>
                  <div><b>Отработано дней:</b> {r.workedDays}</div>
                  <div><b>Отработано часов:</b> {fmtHM(r.totalMinutes)}</div>
                  <div style={{ fontWeight: 700, color: "#1e40af", marginTop: 4 }}>
                    Подробно
                  </div>
                </button>
              ))}
            </div>
          )
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>За выбранный месяц записей нет</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((d) => {
              const calc = calcNetMinutes(d);

              return (
                <div
                  key={d.id}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "rgba(255,255,255,0.85)",
                    padding: 14,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{d.dateKey || d.id}</div>

                  <div><b>Статус:</b> {statusLabel(d)}</div>
                  <div><b>Объект:</b> {d.objectName || "-"}</div>
                  <div><b>Начало:</b> {toTime(d.startAt)}</div>
                  <div><b>Перерыв:</b> {toTime(d.breakStartAt)} – {toTime(d.breakEndAt)}</div>
                  <div><b>Конец:</b> {toTime(d.endAt)}</div>
                  <div>
                    <b>Итого:</b> {d.endAt ? fmtHM(calc.net) : "-"}
                    {calc.br ? (
                      <span style={{ opacity: 0.7 }}>
                        {" "}
                        (перерыв {fmtHM(calc.br)}
                        {calc.shouldApplyDefault ? " по умолчанию" : ""})
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedWorkerId !== ALL_VALUE ? (
          <>
            <div className={styles.divider} />
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              Итого за месяц: {fmtHM(totalMinutes)}
            </div>
          </>
        ) : null}

        <div className={styles.footer}>
          <Link className={styles.link} href="/">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.18)",
  background: "#fff",
  outline: "none",
};
