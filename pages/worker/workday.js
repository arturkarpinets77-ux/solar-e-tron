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
  updateDoc,
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

export default function WorkerWorkdayPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [todayWorkday, setTodayWorkday] = useState(null);

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
    const activeSnap = await getDocs(
      query(collection(db, "Objects"), where("status", "==", "active"))
    );

    const reworkSnap = await getDocs(
      query(
        collection(db, "Objects"),
        where("visibleToWorkerUids", "array-contains", workerUid)
      )
    );

    const activeList = activeSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const reworkList = reworkSnap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((item) => String(item.status || "").toLowerCase() === "rework");

    const uniqueMap = new Map();

    [...activeList, ...reworkList].forEach((item) => {
      uniqueMap.set(item.id, item);
    });

    const list = Array.from(uniqueMap.values()).sort((a, b) =>
      String(a.name || a.id).localeCompare(String(b.name || b.id), "ru")
    );

    setObjects(list);
  }

  async function loadTodayWorkday(uid, dateKey) {
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
  }

  function findSelectedObject() {
    return objects.find((item) => item.id === selectedObjectId) || null;
  }

  function dayStatusLabel() {
    if (!todayWorkday) return "Не начат";

    const status = String(todayWorkday.status || "").toLowerCase();
    if (status === "started") return "В работе";
    if (status === "break") return "Перерыв";
    if (status === "ended") return "Завершён";
    return "Не начат";
  }

  async function handleStartDay() {
    if (!profile?.uid) return;

    const selectedObject = findSelectedObject();
    if (!selectedObject) {
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
          objectId: selectedObject.id,
          objectName: String(selectedObject.name || selectedObject.id),
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

      await updateDoc(ref, {
        status: "break",
        breakStartTime: getNowTime(),
        updatedAt: serverTimestamp(),
      });

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

      await updateDoc(ref, {
        status: "started",
        breakEndTime: getNowTime(),
        updatedAt: serverTimestamp(),
      });

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Перерыв завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка завершения перерыва");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndDay() {
    if (!profile?.uid || !todayWorkday) return;

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await updateDoc(ref, {
        status: "ended",
        endTime: getNowTime(),
        updatedAt: serverTimestamp(),
      });

      await loadTodayWorkday(profile.uid, todayKey);
      setMsg("Рабочий день завершён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка завершения рабочего дня");
    } finally {
      setSaving(false);
    }
  }

  const canStartDay = !todayWorkday;
  const canStartBreak =
    !!todayWorkday &&
    String(todayWorkday.status || "") === "started" &&
    !todayWorkday.breakStartTime &&
    !todayWorkday.endTime;

  const canEndBreak =
    !!todayWorkday &&
    String(todayWorkday.status || "") === "break" &&
    !!todayWorkday.breakStartTime &&
    !todayWorkday.breakEndTime &&
    !todayWorkday.endTime;

  const canEndDay =
    !!todayWorkday &&
    String(todayWorkday.status || "") !== "ended" &&
    !!todayWorkday.startTime &&
    !todayWorkday.endTime;

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
            <span style={valueStyle}>
              <select
                value={selectedObjectId}
                onChange={(e) => setSelectedObjectId(e.target.value)}
                disabled={!canStartDay}
                style={{
                  ...inputStyle,
                  opacity: canStartDay ? 1 : 0.7,
                }}
              >
                <option value="">Выбери объект...</option>
                {objects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Статус дня:</span>
            <span style={valueStyle}>{dayStatusLabel()}</span>
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

        <div style={menuGridStyle}>
          <button
            type="button"
            onClick={handleStartDay}
            disabled={!canStartDay || saving}
            className={s.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canStartDay || saving ? 0.55 : 1,
              cursor: !canStartDay || saving ? "not-allowed" : "pointer",
            }}
          >
            Начать рабочий день
          </button>

          <button
            type="button"
            onClick={handleStartBreak}
            disabled={!canStartBreak || saving}
            className={s.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canStartBreak || saving ? 0.55 : 1,
              cursor: !canStartBreak || saving ? "not-allowed" : "pointer",
            }}
          >
            Начать перерыв
          </button>

          <button
            type="button"
            onClick={handleEndBreak}
            disabled={!canEndBreak || saving}
            className={s.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canEndBreak || saving ? 0.55 : 1,
              cursor: !canEndBreak || saving ? "not-allowed" : "pointer",
            }}
          >
            Закончить перерыв
          </button>

          <button
            type="button"
            onClick={handleEndDay}
            disabled={!canEndDay || saving}
            className={s.actionButton}
            style={{
              ...menuBtnStyle,
              opacity: !canEndDay || saving ? 0.55 : 1,
              cursor: !canEndDay || saving ? "not-allowed" : "pointer",
            }}
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
  gridTemplateColumns: "200px 1fr",
  gap: 10,
  marginBottom: 8,
  alignItems: "center",
};

const labelStyle = {
  fontWeight: 700,
};

const valueStyle = {
  wordBreak: "break-word",
};

const inputStyle = {
  width: "100%",
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
  padding: "0 12px",
  outline: "none",
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
