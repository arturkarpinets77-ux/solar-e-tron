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
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import s from "../../styles/worker.module.css";

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNowTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function dayStatusLabel(status) {
  const value = String(status || "").toLowerCase();

  if (value === "started") return "В работе";
  if (value === "break") return "На перерыве";
  if (value === "ended") return "Завершён";

  return "Не начат";
}

export default function WorkerWorkdayPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [todayWorkday, setTodayWorkday] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState("");

  const todayKey = useMemo(() => getTodayKey(), []);

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

        setProfile({
          uid: user.uid,
          firstName: String(userData.firstName || ""),
          lastName: String(userData.lastName || ""),
          email: String(userData.email || user.email || ""),
          personalNumber: String(userData.personalNumber || ""),
        });

        await Promise.all([
          loadObjectsForWorker(user.uid),
          loadTodayWorkday(user.uid, todayKey),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы рабочего дня");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, todayKey]);

  async function loadObjectsForWorker(workerUid) {
    try {
      const activeSnap = await getDocs(
        query(collection(db, "Objects"), where("status", "==", "active"))
      );

      const reworkSnap = await getDocs(
        query(
          collection(db, "Objects"),
          where("status", "==", "rework"),
          where("visibleToWorkerUids", "array-contains", workerUid)
        )
      );

      const activeList = activeSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const reworkList = reworkSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const uniqueMap = new Map();
      [...activeList, ...reworkList].forEach((item) => {
        uniqueMap.set(item.id, item);
      });

      const list = Array.from(uniqueMap.values()).sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id), "ru")
      );

      setObjects(list);

      setSelectedObjectId((prev) => {
        if (prev) return prev;
        if (list.length === 1) return list[0].id;
        return "";
      });
    } catch (e) {
      setObjects([]);
      setMsg(e?.message || "Ошибка загрузки объектов");
    }
  }

  async function loadTodayWorkday(uid, dateKey) {
    try {
      const ref = doc(db, "Users", uid, "Workdays", dateKey);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setTodayWorkday(null);
        return;
      }

      const data = { id: snap.id, ...snap.data() };
      setTodayWorkday(data);

      if (data.objectId) {
        setSelectedObjectId(String(data.objectId));
      }
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки рабочего дня");
    }
  }

  function selectedObject() {
    return objects.find((item) => item.id === selectedObjectId) || null;
  }

  async function handleStartDay() {
    if (!profile?.uid) return;

    const objectItem = selectedObject();
    if (!objectItem) {
      setMsg("Сначала выбери объект.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          date: todayKey,
          objectId: objectItem.id,
          objectName: String(objectItem.name || objectItem.id),
          status: "started",
          startTime: getNowTime(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Рабочий день начат.");
    } catch (e) {
      setMsg(e?.message || "Ошибка начала рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartBreak() {
    if (!profile?.uid || !todayWorkday) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          status: "break",
          breakStartTime: getNowTime(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Перерыв начат.");
    } catch (e) {
      setMsg(e?.message || "Ошибка начала перерыва");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndBreak() {
    if (!profile?.uid || !todayWorkday) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          status: "started",
          breakEndTime: getNowTime(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Перерыв завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка завершения перерыва");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndDay() {
    if (!profile?.uid) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      const payload = {
        status: "ended",
        endTime: getNowTime(),
        updatedAt: serverTimestamp(),
      };

      if (todayWorkday?.status === "break" && !todayWorkday?.breakEndTime) {
        payload.breakEndTime = getNowTime();
      }

      await setDoc(ref, payload, { merge: true });

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Рабочий день завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка завершения рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  const currentStatus = String(todayWorkday?.status || "");
  const canStartDay = !todayWorkday || !currentStatus || currentStatus === "ended";
  const canChangeObject = canStartDay;
  const canStartBreak =
    currentStatus === "started" &&
    !todayWorkday?.breakStartTime;
  const canEndBreak =
    currentStatus === "break" &&
    !!todayWorkday?.breakStartTime &&
    !todayWorkday?.breakEndTime;
  const canEndDay =
    currentStatus === "started" || currentStatus === "break";

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
            <h1 className={s.title}>Отметка рабочего дня</h1>
            <div className={s.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        <div style={infoBoxStyle}>
          <div style={infoRowStyle}>
            <span style={labelStyle}>Дата:</span>
            <span style={valueStyle}>{todayKey}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Объект:</span>
            <div style={{ width: "100%" }}>
              <select
                value={selectedObjectId}
                onChange={(e) => setSelectedObjectId(e.target.value)}
                disabled={!canChangeObject}
                style={selectStyle}
              >
                <option value="">Выбери объект...</option>
                {objects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Статус дня:</span>
            <span style={valueStyle}>{dayStatusLabel(todayWorkday?.status)}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Начало:</span>
            <span style={valueStyle}>{todayWorkday?.startTime || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Начало перерыва:</span>
            <span style={valueStyle}>{todayWorkday?.breakStartTime || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Конец перерыва:</span>
            <span style={valueStyle}>{todayWorkday?.breakEndTime || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Конец дня:</span>
            <span style={valueStyle}>{todayWorkday?.endTime || "-"}</span>
          </div>
        </div>

        <div style={buttonsWrapStyle}>
          <button
            type="button"
            className={s.actionButton}
            style={buttonStyle}
            onClick={handleStartDay}
            disabled={!canStartDay || saving}
          >
            Начать рабочий день
          </button>

          <button
            type="button"
            className={s.actionButton}
            style={buttonStyle}
            onClick={handleStartBreak}
            disabled={!canStartBreak || saving}
          >
            Начать перерыв
          </button>

          <button
            type="button"
            className={s.actionButton}
            style={buttonStyle}
            onClick={handleEndBreak}
            disabled={!canEndBreak || saving}
          >
            Закончить перерыв
          </button>

          <button
            type="button"
            className={s.actionButton}
            style={buttonStyle}
            onClick={handleEndDay}
            disabled={!canEndDay || saving}
          >
            Завершить рабочий день
          </button>
        </div>

        {msg ? <div style={msgStyle}>{msg}</div> : null}

        <div style={footerStyle}>
          <Link href="/worker">← Назад</Link>
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
  gridTemplateColumns: "170px 1fr",
  gap: 12,
  marginBottom: 10,
  alignItems: "center",
};

const labelStyle = {
  fontWeight: 700,
};

const valueStyle = {
  wordBreak: "break-word",
};

const selectStyle = {
  width: "100%",
  minHeight: 52,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontSize: 16,
  outline: "none",
};

const buttonsWrapStyle = {
  display: "grid",
  gap: 14,
  marginTop: 18,
};

const buttonStyle = {
  minHeight: 62,
  textAlign: "center",
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
