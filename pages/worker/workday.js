// pages/worker/workday.js
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
  orderBy,
} from "firebase/firestore";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKeyLocalYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDateSafe(ts) {
  if (!ts) return null;
  try {
    return ts.toDate ? ts.toDate() : new Date(ts);
  } catch {
    return null;
  }
}

function timeLabel(ts) {
  const d = toDateSafe(ts);
  if (!d) return "-";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new Error("Геолокация не поддерживается этим устройством."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        if (err?.code === 1) {
          reject(new Error("Нет доступа к геолокации. Разреши доступ к местоположению."));
          return;
        }
        if (err?.code === 2) {
          reject(new Error("Не удалось определить местоположение."));
          return;
        }
        if (err?.code === 3) {
          reject(new Error("Превышено время ожидания геолокации."));
          return;
        }
        reject(new Error("Ошибка получения геолокации."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

function visibleForWorker(objectItem, uid) {
  const status = String(objectItem?.status || "").toLowerCase();

  if (status === "active") return true;

  if (status === "rework") {
    return Array.isArray(objectItem?.visibleToWorkerUids)
      ? objectItem.visibleToWorkerUids.includes(uid)
      : false;
  }

  return false;
}

export default function WorkerWorkdayPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [dayDoc, setDayDoc] = useState(null);

  const dateKey = useMemo(() => dateKeyLocalYYYYMMDD(), []);

  const selectedObject = useMemo(() => {
    return objects.find((o) => o.id === selectedObjectId) || null;
  }, [objects, selectedObjectId]);

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
        const userSnap = await getDoc(doc(db, "Users", user.uid));
        if (!userSnap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const userData = userSnap.data() || {};
        const role = String(userData.role || "").trim().toLowerCase();
        const status = String(userData.status || "").trim().toLowerCase();

        if (role !== "worker" || status !== "active") {
          router.replace("/dashboard");
          return;
        }

        const nextProfile = {
          uid: user.uid,
          email: String(userData.email || user.email || "").trim(),
          personalNumber: String(userData.personalNumber || "").trim(),
          role,
          status,
          firstName:
            String(userData.firstName || "").trim() ||
            String(userData.name || "").trim() ||
            "",
          lastName:
            String(userData.lastName || "").trim() ||
            String(userData.surname || "").trim() ||
            "",
        };

        setProfile(nextProfile);

        await Promise.all([
          loadObjects(user.uid),
          loadDay(user.uid),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки рабочего дня");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, dateKey]);

  async function loadObjects(uid) {
    const q = query(collection(db, "Objects"), orderBy("name"));
    const snap = await getDocs(q);

    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => visibleForWorker(item, uid));

    setObjects(list);
  }

  async function loadDay(uid) {
    const snap = await getDoc(doc(db, "Users", uid, "Workdays", dateKey));
    const data = snap.exists() ? snap.data() : null;
    setDayDoc(data);

    if (data?.objectId) {
      setSelectedObjectId(String(data.objectId));
    }
  }

  async function ensureInsideObjectRadius(objectItem) {
    if (!objectItem) {
      throw new Error("Сначала выбери объект.");
    }

    const objLat = Number(objectItem?.geo?.lat);
    const objLng = Number(objectItem?.geo?.lng);
    const radiusMeters = Number(objectItem?.geo?.radiusMeters || 0);

    if (!Number.isFinite(objLat) || !Number.isFinite(objLng) || radiusMeters <= 0) {
      throw new Error("У объекта не настроена геолокация или радиус.");
    }

    const pos = await getCurrentPositionAsync();

    const workerLat = Number(pos.coords.latitude);
    const workerLng = Number(pos.coords.longitude);
    const accuracy = Number(pos.coords.accuracy || 0);

    const dist = distanceMeters(workerLat, workerLng, objLat, objLng);

    if (dist > radiusMeters) {
      throw new Error(
        `Ты находишься вне зоны объекта. До границы примерно ${Math.round(
          dist - radiusMeters
        )} м.`
      );
    }

    return {
      lat: workerLat,
      lng: workerLng,
      accuracy,
      distanceToObjectMeters: Math.round(dist),
      checkedAt: new Date(),
      objectLat: objLat,
      objectLng: objLng,
      objectRadiusMeters: radiusMeters,
    };
  }

  const started = !!dayDoc?.startAt;
  const onBreak = !!dayDoc?.breakStartAt && !dayDoc?.breakEndAt;
  const ended = !!dayDoc?.endAt;

  const canStartDay = !started && !ended;
  const canStartBreak = started && !ended && !onBreak;
  const canEndBreak = started && !ended && onBreak;
  const canEndDay = started && !ended;

  async function handleStartDay() {
    if (!profile?.uid || !selectedObject) {
      setMsg("Сначала выбери объект.");
      return;
    }

    setMsg("");
    setBusy(true);

    try {
      const geoCheck = await ensureInsideObjectRadius(selectedObject);

      await setDoc(
        doc(db, "Users", profile.uid, "Workdays", dateKey),
        {
          dateKey,
          objectId: selectedObject.id,
          objectName: String(selectedObject.name || selectedObject.id),
          objectGeo: {
            lat: Number(selectedObject.geo?.lat || 0),
            lng: Number(selectedObject.geo?.lng || 0),
            radiusMeters: Number(selectedObject.geo?.radiusMeters || 0),
          },
          startAt: serverTimestamp(),
          breakStartAt: null,
          breakEndAt: null,
          endAt: null,
          startGeo: geoCheck,
          status: "started",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadDay(profile.uid);
      setMsg("Рабочий день начат.");
    } catch (e) {
      setMsg(e?.message || "Не удалось начать рабочий день.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartBreak() {
    if (!profile?.uid) return;

    setMsg("");
    setBusy(true);

    try {
      await updateDoc(doc(db, "Users", profile.uid, "Workdays", dateKey), {
        breakStartAt: serverTimestamp(),
        status: "break",
        updatedAt: serverTimestamp(),
      });

      await loadDay(profile.uid);
      setMsg("Перерыв начат.");
    } catch (e) {
      setMsg(e?.message || "Не удалось начать перерыв.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEndBreak() {
    if (!profile?.uid) return;

    setMsg("");
    setBusy(true);

    try {
      await updateDoc(doc(db, "Users", profile.uid, "Workdays", dateKey), {
        breakEndAt: serverTimestamp(),
        status: "started",
        updatedAt: serverTimestamp(),
      });

      await loadDay(profile.uid);
      setMsg("Перерыв завершён.");
    } catch (e) {
      setMsg(e?.message || "Не удалось завершить перерыв.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEndDay() {
    if (!profile?.uid) return;

    setMsg("");
    setBusy(true);

    try {
      const currentSnap = await getDoc(doc(db, "Users", profile.uid, "Workdays", dateKey));
      if (!currentSnap.exists()) {
        throw new Error("Сначала начни рабочий день.");
      }

      const currentDay = currentSnap.data() || {};
      const objectId = String(currentDay.objectId || selectedObjectId || "");
      const objectItem = objects.find((o) => o.id === objectId);

      const geoCheck = await ensureInsideObjectRadius(objectItem);

      await updateDoc(doc(db, "Users", profile.uid, "Workdays", dateKey), {
        endAt: serverTimestamp(),
        endGeo: geoCheck,
        status: "ended",
        updatedAt: serverTimestamp(),
      });

      await loadDay(profile.uid);
      setMsg("Рабочий день завершён.");
    } catch (e) {
      setMsg(e?.message || "Не удалось завершить рабочий день.");
    } finally {
      setBusy(false);
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
              Отметка рабочего дня
            </div>
            <div className={styles.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Дата:</span>
            <span className={styles.value}>{dateKey}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Объект:</span>
            <span className={styles.value}>
              <select
                value={selectedObjectId}
                onChange={(e) => setSelectedObjectId(e.target.value)}
                disabled={started}
                style={inputStyle}
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

          {selectedObject ? (
            <>
              <div className={styles.infoRow}>
                <span className={styles.label}>Координаты объекта:</span>
                <span className={styles.value}>
                  {Number(selectedObject?.geo?.lat || 0).toFixed(6)},{" "}
                  {Number(selectedObject?.geo?.lng || 0).toFixed(6)}
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.label}>Маршрут:</span>
                <span className={styles.value}>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${selectedObject?.geo?.lat},${selectedObject?.geo?.lng}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.link}
                  >
                    Открыть в Google Maps
                  </a>
                </span>
              </div>
            </>
          ) : null}

          <div className={styles.infoRow}>
            <span className={styles.label}>Статус дня:</span>
            <span className={styles.value}>
              {ended
                ? "Завершён"
                : onBreak
                ? "Перерыв"
                : started
                ? "Идёт"
                : "Не начат"}
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Начало:</span>
            <span className={styles.value}>{timeLabel(dayDoc?.startAt)}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Начало перерыва:</span>
            <span className={styles.value}>{timeLabel(dayDoc?.breakStartAt)}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Конец перерыва:</span>
            <span className={styles.value}>{timeLabel(dayDoc?.breakEndAt)}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Конец дня:</span>
            <span className={styles.value}>{timeLabel(dayDoc?.endAt)}</span>
          </div>
        </div>

        <div className={styles.actionsGrid}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleStartDay}
            disabled={!canStartDay || busy}
            style={{ opacity: canStartDay && !busy ? 1 : 0.5 }}
          >
            Начать рабочий день
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={handleStartBreak}
            disabled={!canStartBreak || busy}
            style={{ opacity: canStartBreak && !busy ? 1 : 0.5 }}
          >
            Начать перерыв
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={handleEndBreak}
            disabled={!canEndBreak || busy}
            style={{ opacity: canEndBreak && !busy ? 1 : 0.5 }}
          >
            Закончить перерыв
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={handleEndDay}
            disabled={!canEndDay || busy}
            style={{ opacity: canEndDay && !busy ? 1 : 0.5 }}
          >
            Завершить рабочий день
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.footer}>
          <Link className={styles.link} href="/worker">
            ← Назад
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
