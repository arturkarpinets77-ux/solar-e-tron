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
  updateDoc,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

function pad2(n) {
  return String(n).padStart(2, "0");
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

function roleLabel(role) {
  const value = String(role || "").toLowerCase();

  if (value === "worker") return "Работник";
  if (value === "accountant") return "Бухгалтер";
  if (value === "director") return "Директор";
  if (value === "admin") return "Администратор";

  return role || "-";
}

function tsToDate(ts) {
  if (!ts) return null;
  try {
    return ts.toDate ? ts.toDate() : new Date(ts);
  } catch {
    return null;
  }
}

function tsToInputValue(ts) {
  const d = tsToDate(ts);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
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

export default function ManagerWorkdaysPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState(null);

  const [workers, setWorkers] = useState([]);
  const [objects, setObjects] = useState([]);

  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [monthValue, setMonthValue] = useState(monthValueFromDate());

  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);

  const [formDateKey, setFormDateKey] = useState("");
  const [formObjectId, setFormObjectId] = useState("");
  const [formObjectName, setFormObjectName] = useState("");
  const [formStartAt, setFormStartAt] = useState("");
  const [formBreakStartAt, setFormBreakStartAt] = useState("");
  const [formBreakEndAt, setFormBreakEndAt] = useState("");
  const [formEndAt, setFormEndAt] = useState("");
  const [formStatus, setFormStatus] = useState("started");

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
        const meSnap = await getDoc(doc(db, "Users", user.uid));
        if (!meSnap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const meData = meSnap.data() || {};
        const role = String(meData.role || "").trim().toLowerCase();
        const status = String(meData.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "admin" && role !== "director") {
          router.replace("/dashboard");
          return;
        }

        setMe({
          uid: user.uid,
          role,
          status,
        });

        await Promise.all([loadWorkers(), loadObjects()]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadWorkers() {
    const q = query(collection(db, "Users"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        const role = String(u.role || "").toLowerCase();
        return role === "worker" || role === "director";
      })
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));

    setWorkers(list);
  }

  async function loadObjects() {
    const q = query(collection(db, "Objects"), orderBy("name"));
    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setObjects(list);
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
      setMsg(e?.message || "Ошибка загрузки рабочих дней");
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
    resetEditor();
  }, [selectedWorkerId, monthValue]);

  function resetEditor() {
    setEditingId("");
    setFormDateKey("");
    setFormObjectId("");
    setFormObjectName("");
    setFormStartAt("");
    setFormBreakStartAt("");
    setFormBreakEndAt("");
    setFormEndAt("");
    setFormStatus("started");
  }

  function getObjectNameById(id) {
    const found = objects.find((o) => o.id === id);
    return found ? String(found.name || found.id) : "";
  }

  function openEditor(item) {
    setEditingId(item.id);
    setFormDateKey(String(item.dateKey || item.id || ""));
    setFormObjectId(String(item.objectId || ""));
    setFormObjectName(String(item.objectName || ""));
    setFormStartAt(tsToInputValue(item.startAt));
    setFormBreakStartAt(tsToInputValue(item.breakStartAt));
    setFormBreakEndAt(tsToInputValue(item.breakEndAt));
    setFormEndAt(tsToInputValue(item.endAt));
    setFormStatus(String(item.status || "started"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDay() {
    setMsg("");

    if (!selectedWorkerId || !editingId) {
      setMsg("Не выбран день для редактирования.");
      return;
    }

    if (!formDateKey) {
      setMsg("Дата рабочего дня не указана.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        dateKey: formDateKey,
        objectId: formObjectId || "",
        objectName: formObjectId ? getObjectNameById(formObjectId) : formObjectName || "",
        status: formStatus || "started",
      };

      payload.startAt = formStartAt ? new Date(formStartAt) : null;
      payload.breakStartAt = formBreakStartAt ? new Date(formBreakStartAt) : null;
      payload.breakEndAt = formBreakEndAt ? new Date(formBreakEndAt) : null;
      payload.endAt = formEndAt ? new Date(formEndAt) : null;

      if (payload.endAt) {
        payload.status = "ended";
      } else if (payload.breakStartAt && !payload.breakEndAt) {
        payload.status = "break";
      } else if (payload.startAt) {
        payload.status = "started";
      }

      await updateDoc(
        doc(db, "Users", selectedWorkerId, "Workdays", editingId),
        payload
      );

      setMsg("Рабочий день обновлён.");
      await loadWorkdays(selectedWorkerId, monthValue);
      resetEditor();
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения рабочего дня");
    } finally {
      setSaving(false);
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
              Редактирование рабочего времени
            </div>
            <div className={styles.subtitle}>
              Директор / администратор может корректировать рабочие дни сотрудников
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Сотрудник:</span>
            <span className={styles.value}>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Выбери сотрудника...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {fullName(w)}
                    {w.personalNumber ? ` — ${w.personalNumber}` : ""}
                    {w.role ? ` — ${roleLabel(w.role)}` : ""}
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

          {selectedWorker ? (
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              <b>Выбран:</b> {fullName(selectedWorker)}
              {selectedWorker.personalNumber ? ` — ${selectedWorker.personalNumber}` : ""}
              {selectedWorker.role ? ` — ${roleLabel(selectedWorker.role)}` : ""}
            </div>
          ) : null}
        </div>

        {editingId ? (
          <>
            <div className={styles.divider} />

            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 22 }}>
              Редактирование дня
            </div>

            <div className={styles.infoBox} style={{ display: "grid", gap: 12 }}>
              <div className={styles.infoRow}>
                <span className={styles.label}>Дата:</span>
                <span className={styles.value}>
                  <input
                    value={formDateKey}
                    onChange={(e) => setFormDateKey(e.target.value)}
                    type="date"
                    style={inputStyle}
                  />
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Объект:</span>
                <span className={styles.value}>
                  <select
                    value={formObjectId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormObjectId(id);
                      setFormObjectName(getObjectNameById(id));
                    }}
                    style={inputStyle}
                  >
                    <option value="">Без объекта</option>
                    {objects.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name || o.id}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Начало дня:</span>
                <span className={styles.value}>
                  <input
                    type="datetime-local"
                    value={formStartAt}
                    onChange={(e) => setFormStartAt(e.target.value)}
                    style={inputStyle}
                  />
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Начало перерыва:</span>
                <span className={styles.value}>
                  <input
                    type="datetime-local"
                    value={formBreakStartAt}
                    onChange={(e) => setFormBreakStartAt(e.target.value)}
                    style={inputStyle}
                  />
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Конец перерыва:</span>
                <span className={styles.value}>
                  <input
                    type="datetime-local"
                    value={formBreakEndAt}
                    onChange={(e) => setFormBreakEndAt(e.target.value)}
                    style={inputStyle}
                  />
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Конец дня:</span>
                <span className={styles.value}>
                  <input
                    type="datetime-local"
                    value={formEndAt}
                    onChange={(e) => setFormEndAt(e.target.value)}
                    style={inputStyle}
                  />
                </span>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={saveDay}
                  disabled={saving}
                  style={{
                    maxWidth: 260,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Сохранение..." : "Сохранить изменения"}
                </button>

                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={resetEditor}
                >
                  Отменить
                </button>
              </div>
            </div>
          </>
        ) : null}

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.divider} />

        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 22 }}>
          Рабочие дни
        </div>

        {!selectedWorkerId ? (
          <div style={{ opacity: 0.7 }}>Сначала выбери сотрудника</div>
        ) : rowsLoading ? (
          <div style={{ opacity: 0.7 }}>Загрузка рабочих дней...</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>За выбранный месяц записей нет</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((d) => (
              <div
                key={d.id}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: "1px solid rgba(120, 90, 20, 0.16)",
                  background: "rgba(255, 252, 240, 0.82)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {d.dateKey || d.id}
                </div>

                <div><b>Статус:</b> {statusLabel(d)}</div>
                <div><b>Объект:</b> {d.objectName || "-"}</div>
                <div><b>Начало:</b> {tsToInputValue(d.startAt) || "-"}</div>
                <div><b>Начало перерыва:</b> {tsToInputValue(d.breakStartAt) || "-"}</div>
                <div><b>Конец перерыва:</b> {tsToInputValue(d.breakEndAt) || "-"}</div>
                <div><b>Конец дня:</b> {tsToInputValue(d.endAt) || "-"}</div>

                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => openEditor(d)}
                    style={{ maxWidth: 240 }}
                  >
                    Редактировать
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <Link className={styles.link} href="/manager">
            ← В кабинет
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
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
};
