// pages/worker/objects.js
import { useEffect, useState } from "react";
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

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

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

export default function WorkerObjectsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [objects, setObjects] = useState([]);

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

        const q = query(collection(db, "Objects"), orderBy("name"));
        const snap = await getDocs(q);

        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => visibleForWorker(item, user.uid));

        setObjects(list);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки объектов");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  function statusLabel(status) {
    if (status === "active") return "Активный";
    if (status === "inactive") return "Неактивный";
    if (status === "rework") return "Доработка";
    return status || "-";
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
            <div className={`${styles.title} ${typo.title}`}>Объекты</div>
            <div className={styles.subtitle}>Доступные объекты работника</div>
          </div>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {objects.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Нет доступных объектов</div>
          ) : (
            objects.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.85)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {item.name || item.id}
                </div>

                <div><b>Статус:</b> {statusLabel(item.status)}</div>

                <div>
                  <b>Координаты:</b>{" "}
                  {item?.geo?.lat && item?.geo?.lng
                    ? `${Number(item.geo.lat).toFixed(6)}, ${Number(item.geo.lng).toFixed(6)}`
                    : "-"}
                </div>

                <div style={{ marginTop: 4 }}>
                  <Link
                    href={`/worker/object/${encodeURIComponent(item.id)}`}
                    className={styles.actionButton}
                    style={{ display: "inline-block", maxWidth: 240, textAlign: "center" }}
                  >
                    Открыть объект
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <Link className={styles.link} href="/worker">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}
