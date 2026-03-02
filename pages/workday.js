import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function docId(uid, date) {
  return `${uid}_${date}`;
}

function getGeoOnce() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export default function WorkdayPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      const mySnap = await getDoc(doc(db, "Users", u.uid));
      if (!mySnap.exists()) {
        router.push("/login");
        return;
      }
      const data = mySnap.data();
      if (String(data.status || "") !== "active") {
        router.push("/login");
        return;
      }
      setMe({ uid: u.uid, ...data });
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  async function mark(type) {
    setMsg("");
    try {
      const date = todayKey();
      const uid = me.uid;
      const id = docId(uid, date);

      const logRef = doc(db, "WorkLogs", id);
      const geoRef = doc(db, "WorkLogGeo", id);

      const fieldMap = {
        checkIn: "checkInAt",
        lunchStart: "lunchStartAt",
        lunchEnd: "lunchEndAt",
        checkOut: "checkOutAt",
      };

      const f = fieldMap[type];
      if (!f) throw new Error("Неизвестный тип отметки");

      // Пишем отметку времени
      await setDoc(
        logRef,
        {
          uid,
          date,
          [f]: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Пишем гео (опционально)
      const geo = await getGeoOnce();
      if (geo) {
        const geoFieldMap = {
          checkIn: "checkInGeo",
          lunchStart: "lunchStartGeo",
          lunchEnd: "lunchEndGeo",
          checkOut: "checkOutGeo",
        };
        await setDoc(
          geoRef,
          {
            uid,
            date,
            [geoFieldMap[type]]: geo,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      setMsg("Сохранено.");
    } catch (e) {
      setMsg(e?.message || "Ошибка");
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>Отметка рабочего дня</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/dashboard">← В кабинет</Link>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", maxWidth: 520 }}>
        <button style={btn} onClick={() => mark("checkIn")}>Приход</button>
        <button style={btn} onClick={() => mark("lunchStart")}>Обед начался</button>
        <button style={btn} onClick={() => mark("lunchEnd")}>Обед закончился</button>
        <button style={btn} onClick={() => mark("checkOut")}>Уход</button>
      </div>

      {msg ? <div style={{ marginTop: 12 }}>{msg}</div> : null}

      <div style={{ marginTop: 16, color: "#64748b" }}>
        Геолокация (если разрешишь браузеру) сохранится отдельно и видна только директору/админу.
      </div>
    </main>
  );
}

const btn = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
