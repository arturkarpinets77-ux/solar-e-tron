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

export default function AccountantPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [monthValue, setMonthValue] = useState(monthValueFromDate());

  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
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

        await loadWorkers();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета бухгалтера");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadWorkers() {
    if (!db) return;

    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => String(u.role || "").toLowerCase() === "worker")
      .sort((a, b) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName);
      });

    setWorkers(list);
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
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки рабочего времени");
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedWorkerId || !monthValue) {
      setRows([]);
      return;
    }
    loadWorkdays(selectedWorkerId, monthValue);
  }, [selectedWorkerId, monthValue]);

  const totalMinutes = useMemo(() => {
    return rows.reduce((sum, d) => {
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

      return sum + net;
    }, 0);
  }, [rows]);

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
                <option value="">Выбери работника...</option>
                {workers.map((w) => {
                  const fullName =
                    `${w.firstName || ""} ${w.lastName || ""}`.trim() ||
                    w.email ||
                    w.id;

                  return (
                    <option key={w.id} value={w.id}>
                      {fullName}
                      {w.personalNumber ? ` — ${w.personalNumber}` : ""}
                    </option>
                  );
                })}
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

          {selectedWorker ? (
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              <b>Выбран:</b>{" "}
              {`${selectedWorker.firstName || ""} ${selectedWorker.lastName || ""}`.trim() ||
                selectedWorker.email ||
                selectedWorker.id}
              {selectedWorker.personalNumber
                ? ` — ${selectedWorker.personalNumber}`
                : ""}
            </div>
          ) : null}
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Рабочие дни
        </div>

        {!selectedWorkerId ? (
          <div style={{ opacity: 0.7 }}>Сначала выбери работника</div>
        ) : rowsLoading ? (
          <div style={{ opacity: 0.7 }}>Загрузка данных...</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>За выбранный месяц записей нет</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((d) => {
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
                  <div><b>Начало:</b> {toTime(start)}</div>
                  <div><b>Перерыв:</b> {toTime(bS)} – {toTime(bE)}</div>
                  <div><b>Конец:</b> {toTime(end)}</div>
                  <div>
                    <b>Итого:</b> {end ? fmtHM(net) : "-"}
                    {br ? (
                      <span style={{ opacity: 0.7 }}>
                        {" "}
                        (перерыв {fmtHM(br)}
                        {shouldApplyDefault ? " по умолчанию" : ""})
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Итого за месяц: {fmtHM(totalMinutes)}
        </div>

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
