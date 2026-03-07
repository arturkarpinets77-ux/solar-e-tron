// pages/worker/object/[id].js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import styles from "../../../styles/worker.module.css";
import typo from "../../../styles/typography.module.css";

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

export default function WorkerObjectDetailsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [objectItem, setObjectItem] = useState(null);

  useEffect(() => {
    if (!auth || !db || !id) return;

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

        const objectSnap = await getDoc(doc(db, "Objects", String(id)));
        if (!objectSnap.exists()) {
          setMsg("Объект не найден.");
          setObjectItem(null);
          return;
        }

        const data = { id: objectSnap.id, ...objectSnap.data() };

        if (!visibleForWorker(data, user.uid)) {
          setMsg("У тебя нет доступа к этому объекту.");
          setObjectItem(null);
          return;
        }

        setObjectItem(data);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки объекта");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, id]);

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
            <div className={`${styles.title} ${typo.title}`}>
              {objectItem?.name || "Объект"}
            </div>
            <div className={styles.subtitle}>Карточка объекта</div>
          </div>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        {objectItem ? (
          <div className={styles.infoBox}>
            <div className={styles.infoRow}>
              <span className={styles.label}>Название:</span>
              <span className={styles.value}>{objectItem.name || objectItem.id}</span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.label}>Статус:</span>
              <span className={styles.value}>{statusLabel(objectItem.status)}</span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.label}>Широта:</span>
              <span className={styles.value}>
                {objectItem?.geo?.lat ? Number(objectItem.geo.lat).toFixed(6) : "-"}
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.label}>Долгота:</span>
              <span className={styles.value}>
                {objectItem?.geo?.lng ? Number(objectItem.geo.lng).toFixed(6) : "-"}
              </span>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${objectItem?.geo?.lat},${objectItem?.geo?.lng}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className={styles.actionButton}
                style={{ display: "inline-block", maxWidth: 260, textAlign: "center" }}
              >
                Открыть в Google Maps
              </a>

              <Link
                href="/worker/workday"
                className={styles.btnSecondary}
                style={{ display: "inline-block", textAlign: "center" }}
              >
                Перейти к отметке дня
              </Link>
            </div>
          </div>
        ) : null}

        <div className={styles.footer}>
          <Link className={styles.link} href="/worker/objects">
            ← К объектам
          </Link>
        </div>
      </div>
    </main>
  );
}
