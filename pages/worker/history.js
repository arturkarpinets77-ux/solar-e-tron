// pages/worker/history.js
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
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import styles from "../../styles/worker.module.css";
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

export default function WorkerHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]);

  const workdaysCol = useMemo(() => {
    if (!db || !profile?.uid) return null;
    return collection(db, "Users", profile.uid, "Workdays");
  }, [profile?.uid]);

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

        if (status !== "active" || role !== "worker") {
          router.replace("/dashboard");
          return;
        }

        setProfile({ uid: user.uid });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  useEffect(() => {
    (async () => {
      if (!workdaysCol) return;
      setMsg("");
      setLoading(true);

      try {
        const q = query(workdaysCol, orderBy("dateKey", "desc"), limit(31));
        const snaps = await getDocs(q);

        const list = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(list);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки истории");
      } finally {
        setLoading(false);
      }
    })();
  }, [workdaysCol]);

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
              История рабочего времени
            </div>
            <div className={styles.subtitle}>Последние 31 день</div>
          </div>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.infoBox} style={{ marginTop: 14 }}>
          {rows.length === 0 ? (
            <div>Записей пока нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((d) => {
                const start = d.startAt;
                const end = d.endAt;
                const bS = d.breakStartAt;
                const bE = d.breakEndAt;

                const total = minutesBetween(start, end);

                // Фактический перерыв (если отмечали)
                const brActual = minutesBetween(bS, bE);

                // Если перерыв НЕ отмечали вообще — вычитаем по умолчанию 30 минут (только для завершённого дня)
                const noBreakMarked = !bS && !bE;
                const shouldApplyDefault = !!end && noBreakMarked;

                const br = shouldApplyDefault ? DEFAULT_BREAK_MINUTES : brActual;
                const net = Math.max(0, total - br);

                return (
                  <div
                    key={d.id}
                    style={{
                      border: "1px solid rgba(15, 23, 42, 0.10)",
                      borderRadius: 14,
                      padding: 14,
                      background: "rgba(255,255,255,0.78)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <b>{d.dateKey || d.id}</b>
                      <span style={{ opacity: 0.75 }}>{statusLabel(d)}</span>
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gridTemplateColumns: "140px 1fr",
                        gap: "6px 12px",
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ opacity: 0.75 }}>Начало</div>
                      <div>{toTime(start)}</div>

                      <div style={{ opacity: 0.75 }}>Перерыв</div>
                      <div>
                        {toTime(bS)} – {toTime(bE)}
                      </div>

                      <div style={{ opacity: 0.75 }}>Конец</div>
                      <div>{toTime(end)}</div>

                      <div style={{ opacity: 0.75 }}>Итого</div>
                      <div>
                        {end ? (
                          <>
                            {fmtHM(net)}
                            {br ? (
                              <span style={{ opacity: 0.7 }}>
                                {" "}
                                (перерыв {fmtHM(br)}
                                {shouldApplyDefault ? " по умолчанию" : ""})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Link href="/worker" className={styles.link}>
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}
