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
  query,
  where,
} from "firebase/firestore";

import styles from "../../styles/worker.module.css";
import typo from "../../styles/typography.module.css";

function visibleForWorker(objectItem, uid) {
  const status = String(
    objectItem?.status || ""
  ).toLowerCase();

  if (status === "active") return true;

  if (status === "rework") {
    return Array.isArray(
      objectItem?.visibleToWorkerUids
    )
      ? objectItem.visibleToWorkerUids.includes(uid)
      : false;
  }

  return false;
}

function workTypeLabel(workType) {
  return workType === "roof" ? "Крыша" : "Поле";
}

export default function WorkerObjectsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [objects, setObjects] = useState([]);

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        setMsg("");
        setLoading(true);

        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          const userSnap = await getDoc(
            doc(db, "Users", user.uid)
          );

          if (!userSnap.exists()) {
            await signOut(auth);
            router.replace("/login");
            return;
          }

          const userData = userSnap.data() || {};

          const role = String(
            userData.role || ""
          )
            .trim()
            .toLowerCase();

          const status = String(
            userData.status || ""
          )
            .trim()
            .toLowerCase();

          if (
            role !== "worker" ||
            status !== "active"
          ) {
            router.replace("/dashboard");
            return;
          }

          const activeQ = query(
            collection(db, "Objects"),
            where("status", "==", "active")
          );

          const reworkQ = query(
            collection(db, "Objects"),
            where("status", "==", "rework"),
            where(
              "visibleToWorkerUids",
              "array-contains",
              user.uid
            )
          );

          const [activeSnap, reworkSnap] =
            await Promise.all([
              getDocs(activeQ),
              getDocs(reworkQ),
            ]);

          const map = new Map();

          activeSnap.docs.forEach((item) => {
            map.set(item.id, {
              id: item.id,
              ...item.data(),
            });
          });

          reworkSnap.docs.forEach((item) => {
            map.set(item.id, {
              id: item.id,
              ...item.data(),
            });
          });

          const list = Array.from(map.values())
            .filter((item) =>
              visibleForWorker(item, user.uid)
            )
            .sort((a, b) => {
  const statusPriority = {
    active: 0,
    rework: 1,
    inactive: 2,
  };

  const statusA = String(
    a?.status || ""
  ).toLowerCase();

  const statusB = String(
    b?.status || ""
  ).toLowerCase();

  const priorityA =
    statusPriority[statusA] ?? 99;

  const priorityB =
    statusPriority[statusB] ?? 99;

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  return String(
    a?.name || a?.id || ""
  ).localeCompare(
    String(
      b?.name || b?.id || ""
    ),
    "ru"
  );
});

          setObjects(list);
        } catch (error) {
          console.error(
            "Ошибка загрузки объектов работника:",
            error
          );

          setMsg(
            error?.message ||
              "Ошибка загрузки объектов"
          );

          setObjects([]);
        } finally {
          setLoading(false);
        }
      }
    );

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
        <div
          className={`${styles.card} ${typo.base}`}
        >
          Загрузка...
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div
        className={`${styles.card} ${typo.base}`}
      >
        <div className={styles.header}>
          <div>
            <div
              className={`${styles.title} ${typo.title}`}
            >
              Объекты
            </div>

            <div className={styles.subtitle}>
              Доступные объекты работника
            </div>
          </div>
        </div>

        {msg ? (
          <div className={styles.msg}>
            {msg}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 12,
          }}
        >
          {objects.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              Нет доступных объектов
            </div>
          ) : (
            objects.map((item) => {
              const workType =
                item.workType === "roof"
                  ? "roof"
                  : "field";

              const roofFieldsCount =
                Number(item.roofFieldCount) ||
                (Array.isArray(item.roofFields)
                  ? item.roofFields.length
                  : 0);

              const totalPanels =
                Number(item.mapPlanPanels) || 0;

              return (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 14,
                    border:
                      "1px solid rgba(15,23,42,0.12)",
                    background:
                      "rgba(255,255,255,0.85)",
                    padding: 14,
                    display: "grid",
                    gap: 8,
                    color: "#1f2937",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color: "#1f2937",
                      }}
                    >
                      {item.name || item.id}
                    </div>

                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background:
                          workType === "roof"
                            ? "#e5eefc"
                            : "#e4f3e4",
                        color:
                          workType === "roof"
                            ? "#294f7f"
                            : "#285d2c",
                      }}
                    >
                      {workTypeLabel(workType)}
                    </span>
                  </div>

                  <div>
                    <b>Статус:</b>{" "}
                    {statusLabel(item.status)}
                  </div>

                  {workType === "roof" ? (
                    <div>
                      <b>Поля крыши:</b>{" "}
                      {roofFieldsCount},{" "}
                      <b>панелей:</b>{" "}
                      {totalPanels}
                    </div>
                  ) : (
                    <div>
                      <b>Конструкций:</b>{" "}
                      {Number(
                        item.mapPlanConstructions
                      ) || 0}
                      , <b>панелей:</b>{" "}
                      {totalPanels}
                    </div>
                  )}

                  <div>
                    <b>Координаты:</b>{" "}
                    {item?.geo?.lat &&
                    item?.geo?.lng
                      ? `${Number(
                          item.geo.lat
                        ).toFixed(6)}, ${Number(
                          item.geo.lng
                        ).toFixed(6)}`
                      : "-"}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginTop: 4,
                    }}
                  >
                    <Link
                      href={`/worker/object/${encodeURIComponent(
                        item.id
                      )}`}
                      className={
                        styles.actionButton
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        maxWidth: 240,
                        minHeight: 46,
                        textAlign: "center",
                      }}
                    >
                      Открыть объект
                    </Link>

                    {workType === "roof" ? (
                      <Link
                        href={`/roof-map/${encodeURIComponent(
                          item.id
                        )}`}
                        className={
                          styles.actionButton
                        }
                        style={{
                          display:
                            "inline-flex",
                          alignItems: "center",
                          justifyContent:
                            "center",
                          maxWidth: 240,
                          minHeight: 46,
                          textAlign: "center",
                          background:
                            "#355f8d",
                        }}
                      >
                        Открыть карту крыши
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <Link
            className={styles.link}
            href="/worker"
          >
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}
