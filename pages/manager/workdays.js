import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";

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

function getObjectGeo(objectItem) {
  if (!objectItem) return null;

  const lat =
    objectItem.lat ??
    objectItem.latitude ??
    objectItem.objectGeo?.lat ??
    objectItem.geo?.lat ??
    null;

  const lng =
    objectItem.lng ??
    objectItem.lon ??
    objectItem.longitude ??
    objectItem.objectGeo?.lng ??
    objectItem.geo?.lng ??
    null;

  const radiusMeters =
    objectItem.radiusMeters ??
    objectItem.radius ??
    objectItem.objectGeo?.radiusMeters ??
    objectItem.geo?.radiusMeters ??
    500;

  if (lat === null || lng === null) return null;

  return {
    lat: Number(lat),
    lng: Number(lng),
    radiusMeters: Number(radiusMeters || 500),
  };
}

function timestampToTime(value) {
  if (!value) return "";

  let d = null;

  if (typeof value?.toDate === "function") {
    d = value.toDate();
  } else if (typeof value?.seconds === "number") {
    d = new Date(value.seconds * 1000);
  } else if (value instanceof Date) {
    d = value;
  }

  if (!d || Number.isNaN(d.getTime())) return "";

  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");

  return `${h}:${m}`;
}

function timeToTimestamp(dateKey, timeText) {
  const clean = String(timeText || "").trim();

  if (!clean) return null;

  const [hRaw, mRaw] = clean.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);

  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }

  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h, m, 0, 0);

  return Timestamp.fromDate(d);
}

function timeToMinutes(timeText) {
  const clean = String(timeText || "").trim();
  if (!clean) return null;

  const [hRaw, mRaw] = clean.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);

  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }

  return h * 60 + m;
}

function makeEditForm(day) {
  const raw = day?.raw || {};

  return {
    dateKey: day?.dateKey || day?.id || "",
    objectId: day?.objectId || raw.objectId || "",
    status: raw.status || day?.status || "ended",

    startTime:
      timestampToTime(raw.startAt) ||
      raw.startTime ||
      day?.startText ||
      "",

    breakStartTime:
      timestampToTime(raw.breakStartAt) ||
      raw.breakStartTime ||
      "",

    breakEndTime:
      timestampToTime(raw.breakEndAt) ||
      raw.breakEndTime ||
      "",

    endTime:
      timestampToTime(raw.endAt) ||
      raw.endTime ||
      day?.endText ||
      "",
  };
}

export default function ManagerWorkdaysPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [currentManager, setCurrentManager] = useState(null);

  const [users, setUsers] = useState([]);
  const [objects, setObjects] = useState([]);

  const [selectedUid, setSelectedUid] = useState("");
  const [allDays, setAllDays] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  const [editingDayId, setEditingDayId] = useState("");
  const [editForm, setEditForm] = useState(null);

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

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setCurrentManager({
          uid: user.uid,
          role,
          name:
            `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
            data.email ||
            user.email ||
            user.uid,
        });

        await Promise.all([loadUsers(), loadObjects()]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки рабочего времени");
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

    const firstWorker =
      list.find((u) => String(u.role || "").toLowerCase() === "worker") ||
      list[0];

    if (firstWorker) {
      setSelectedUid(firstWorker.id);
      await loadWorkdays(firstWorker.id);
    }
  }

  async function loadObjects() {
    const snap = await getDocs(collection(db, "Objects"));

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id), "ru")
      );

    setObjects(list);
  }

  async function loadWorkdays(uid) {
    setMsg("");
    setEditingDayId("");
    setEditForm(null);

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

  async function handleUserChange(uid) {
    setSelectedUid(uid);
    await loadWorkdays(uid);
  }

  function startEdit(day) {
    setMsg("");
    setEditingDayId(day.id);
    setEditForm(makeEditForm(day));
  }

  function cancelEdit() {
    setEditingDayId("");
    setEditForm(null);
    setMsg("");
  }

  function updateEditField(field, value) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveEdit() {
    if (!selectedUid || !editingDayId || !editForm) return;

    const dateKey = editForm.dateKey || editingDayId;

    const startMinutes = timeToMinutes(editForm.startTime);
    const breakStartMinutes = timeToMinutes(editForm.breakStartTime);
    const breakEndMinutes = timeToMinutes(editForm.breakEndTime);
    const endMinutes = timeToMinutes(editForm.endTime);

    if (editForm.startTime && startMinutes === null) {
      setMsg("Неверное время начала.");
      return;
    }

    if (editForm.breakStartTime && breakStartMinutes === null) {
      setMsg("Неверное время начала перерыва.");
      return;
    }

    if (editForm.breakEndTime && breakEndMinutes === null) {
      setMsg("Неверное время конца перерыва.");
      return;
    }

    if (editForm.endTime && endMinutes === null) {
      setMsg("Неверное время конца дня.");
      return;
    }

    if (
      startMinutes !== null &&
      endMinutes !== null &&
      endMinutes < startMinutes
    ) {
      setMsg("Конец дня не может быть раньше начала.");
      return;
    }

    if (
      breakStartMinutes !== null &&
      breakEndMinutes !== null &&
      breakEndMinutes < breakStartMinutes
    ) {
      setMsg("Конец перерыва не может быть раньше начала перерыва.");
      return;
    }

    const objectItem = objects.find((o) => o.id === editForm.objectId) || null;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", selectedUid, "Workdays", editingDayId);

      const payload = {
        dateKey,
        date: dateKey,

        status: editForm.status || "ended",

        objectId: objectItem?.id || editForm.objectId || "",
        objectName: objectItem ? String(objectItem.name || objectItem.id) : "",

        objectGeo: objectItem ? getObjectGeo(objectItem) : null,

        startAt: timeToTimestamp(dateKey, editForm.startTime),
        breakStartAt: timeToTimestamp(dateKey, editForm.breakStartTime),
        breakEndAt: timeToTimestamp(dateKey, editForm.breakEndTime),
        endAt: timeToTimestamp(dateKey, editForm.endTime),

        startTime: null,
        breakStartTime: null,
        breakEndTime: null,
        endTime: null,

        defaultBreakMinutes: DEFAULT_BREAK_MINUTES,

        editedBy: currentManager?.uid || "",
        editedByName: currentManager?.name || "",
        editedByRole: currentManager?.role || "",

        updatedAt: serverTimestamp(),
      };

      await setDoc(ref, payload, { merge: true });

      await loadWorkdays(selectedUid);

      setMsg("Рабочий день обновлён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.card} style={{ color: "#111827" }}>
          Загрузка...
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card} style={{ color: "#111827" }}>
        <div className={styles.header}>
          <div>
            <div className={styles.title} style={{ color: "#111827" }}>
              Рабочее время работников
            </div>

            <div className={styles.subtitle} style={{ color: "#374151" }}>
              Просмотр и редактирование рабочих дней
            </div>
          </div>
        </div>

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
            <b>Выбран:</b> {selectedUser ? userDisplayName(selectedUser) : "-"}
          </div>
        </div>

        {msg ? <div style={msgStyle}>{msg}</div> : null}

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {visibleDays.length === 0 ? (
            <div style={emptyStyle}>Записей нет</div>
          ) : (
            visibleDays.map((d) => {
              const isEditing = editingDayId === d.id;

              return (
                <div key={d.id} style={dayStyle}>
                  <div style={topRowStyle}>
                    <b>{d.dateKey}</b>
                    <span>{d.statusText}</span>
                  </div>

                  {!isEditing ? (
                    <>
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

                      {d.raw?.editedByName ? (
                        <div style={editedStyle}>
                          Изменено: {d.raw.editedByName}
                        </div>
                      ) : null}

                      <div style={buttonsStyle}>
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          style={buttonStyle}
                        >
                          Редактировать
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={editBoxStyle}>
                      <div style={grid2Style}>
                        <div>
                          <div style={labelStyle}>Объект</div>

                          <select
                            value={editForm?.objectId || ""}
                            onChange={(e) =>
                              updateEditField("objectId", e.target.value)
                            }
                            style={inputStyle}
                          >
                            <option value="">Без объекта</option>

                            {objects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name || o.id}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div style={labelStyle}>Статус</div>

                          <select
                            value={editForm?.status || "ended"}
                            onChange={(e) =>
                              updateEditField("status", e.target.value)
                            }
                            style={inputStyle}
                          >
                            <option value="started">В работе</option>
                            <option value="break">На перерыве</option>
                            <option value="ended">Завершён</option>
                          </select>
                        </div>
                      </div>

                      <div style={grid4Style}>
                        <div>
                          <div style={labelStyle}>Начало</div>

                          <input
                            type="time"
                            value={editForm?.startTime || ""}
                            onChange={(e) =>
                              updateEditField("startTime", e.target.value)
                            }
                            style={inputStyle}
                          />
                        </div>

                        <div>
                          <div style={labelStyle}>Начало перерыва</div>

                          <input
                            type="time"
                            value={editForm?.breakStartTime || ""}
                            onChange={(e) =>
                              updateEditField("breakStartTime", e.target.value)
                            }
                            style={inputStyle}
                          />
                        </div>

                        <div>
                          <div style={labelStyle}>Конец перерыва</div>

                          <input
                            type="time"
                            value={editForm?.breakEndTime || ""}
                            onChange={(e) =>
                              updateEditField("breakEndTime", e.target.value)
                            }
                            style={inputStyle}
                          />
                        </div>

                        <div>
                          <div style={labelStyle}>Конец дня</div>

                          <input
                            type="time"
                            value={editForm?.endTime || ""}
                            onChange={(e) =>
                              updateEditField("endTime", e.target.value)
                            }
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div style={buttonsStyle}>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving}
                          style={saveButtonStyle}
                        >
                          {saving ? "Сохранение..." : "Сохранить"}
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          style={buttonStyle}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <h2 style={totalStyle}>
          Итого за месяц: {formatMinutes(totalMonthMinutes)}
        </h2>

        <div className={styles.footer}>
          <Link className={styles.link} href="/manager">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}

const boxStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.86)",
  border: "1px solid rgba(15,23,42,0.08)",
  color: "#111827",
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const grid4Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 14,
  marginTop: 14,
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
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.96)",
  padding: "0 12px",
  color: "#111827",
};

const emptyStyle = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.86)",
  border: "1px solid rgba(15,23,42,0.08)",
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

const editBoxStyle = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(120,90,20,0.14)",
  color: "#111827",
};

const buttonsStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};

const buttonStyle = {
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(255,255,255,0.95)",
  color: "#111827",
  cursor: "pointer",
};

const saveButtonStyle = {
  border: "1px solid rgba(120,90,20,0.18)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(191, 146, 48, 0.95)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const msgStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,245,230,0.95)",
  color: "#111827",
};

const editedStyle = {
  marginTop: 8,
  opacity: 0.75,
  fontSize: 14,
  color: "#111827",
};

const totalStyle = {
  marginTop: 22,
  color: "#111827",
};
