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
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import s from "../../styles/worker.module.css";
import {
  DEFAULT_BREAK_MINUTES,
  getTodayKey,
  normalizeWorkday,
} from "../../lib/workdayUtils";

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

function getBrowserGeo() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || null,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

function distanceMeters(pointA, pointB) {
  if (!pointA || !pointB) return null;

  const lat1 = Number(pointA.lat);
  const lng1 = Number(pointA.lng);
  const lat2 = Number(pointB.lat);
  const lng2 = Number(pointB.lng);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }

  const R = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
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

  const normalized = useMemo(() => {
    if (!todayWorkday) return null;
    return normalizeWorkday(todayWorkday.id, todayWorkday);
  }, [todayWorkday]);

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

    const objectGeo = getObjectGeo(objectItem);

    if (!objectGeo) {
      setMsg("У объекта нет координат. Начать рабочий день невозможно.");
      return;
    }

    setSaving(true);
    setMsg("Проверяю геолокацию...");

    try {
      const userGeo = await getBrowserGeo();

      if (!userGeo) {
        setMsg(
          "Не удалось получить геолокацию телефона. Разреши доступ к местоположению и попробуй снова."
        );
        setSaving(false);
        return;
      }

      const distance = distanceMeters(userGeo, objectGeo);
      const allowedRadius = Number(objectGeo.radiusMeters || 500);

      if (distance === null) {
        setMsg("Не удалось рассчитать расстояние до объекта.");
        setSaving(false);
        return;
      }

      if (distance > allowedRadius) {
        setMsg(
          `Ты находишься примерно в ${distance} м от объекта. Разрешённый радиус: ${allowedRadius} м. Начать рабочий день можно только на объекте.`
        );
        setSaving(false);
        return;
      }

      const now = new Date();
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          dateKey: todayKey,
          date: todayKey,
          status: "started",

          objectId: objectItem.id,
          objectName: String(objectItem.name || objectItem.id),
          objectGeo,

          startAt: Timestamp.fromDate(now),
          breakStartAt: null,
          breakEndAt: null,
          endAt: null,

          startGeo: userGeo,
          endGeo: null,

          startDistanceMeters: distance,
          defaultBreakMinutes: DEFAULT_BREAK_MINUTES,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
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

    const now = new Date();

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          status: "break",
          breakStartAt: Timestamp.fromDate(now),
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

    const now = new Date();

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      await setDoc(
        ref,
        {
          status: "started",
          breakEndAt: Timestamp.fromDate(now),
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
    if (!profile?.uid || !todayWorkday) return;

    const now = new Date();

    setSaving(true);
    setMsg("Сохраняю завершение рабочего дня...");

    try {
      const userGeo = await getBrowserGeo();
      const objectGeo =
        todayWorkday.objectGeo ||
        getObjectGeo(selectedObject()) ||
        null;

      const endDistanceMeters =
        userGeo && objectGeo ? distanceMeters(userGeo, objectGeo) : null;

      const ref = doc(db, "Users", profile.uid, "Workdays", todayKey);

      const payload = {
        status: "ended",
        endAt: Timestamp.fromDate(now),
        endGeo: userGeo,
        endDistanceMeters,
        updatedAt: serverTimestamp(),
      };

      if (
        String(todayWorkday.status || "") === "break" &&
        !todayWorkday.breakEndAt
      ) {
        payload.breakEndAt = Timestamp.fromDate(now);
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
    !todayWorkday?.breakStartAt &&
    !todayWorkday?.breakStartTime;

  const canEndBreak = currentStatus === "break";
  const canEndDay = currentStatus === "started" || currentStatus === "break";

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
            <span style={valueStyle}>{normalized?.statusText || "Не начат"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Начало:</span>
            <span style={valueStyle}>{normalized?.startText || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Начало перерыва:</span>
            <span style={valueStyle}>{normalized?.breakStartText || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Конец перерыва:</span>
            <span style={valueStyle}>{normalized?.breakEndText || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Конец дня:</span>
            <span style={valueStyle}>{normalized?.endText || "-"}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Итого:</span>
            <span style={valueStyle}>
              {normalized?.endText && normalized.endText !== "-"
                ? `${normalized.totalText} (обед ${DEFAULT_BREAK_MINUTES} мин, если перерыв не отмечен)`
                : "-"}
            </span>
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
