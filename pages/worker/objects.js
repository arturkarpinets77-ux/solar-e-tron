// pages/worker/objects.js

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/router";

import {
  auth,
  db,
} from "../../lib/firebaseClient";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

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

function visibleForWorker(
  objectItem,
  uid
) {
  const status = String(
    objectItem?.status || ""
  ).toLowerCase();

  if (status === "active") {
    return true;
  }

  if (status === "rework") {
    return Array.isArray(
      objectItem?.visibleToWorkerUids
    )
      ? objectItem.visibleToWorkerUids.includes(
          uid
        )
      : false;
  }

  return false;
}

function workTypeLabel(workType) {
  return workType === "roof"
    ? "Крыша"
    : "Поле";
}

function statusLabel(status) {
  if (status === "active") {
    return "Активный";
  }

  if (status === "inactive") {
    return "Неактивный";
  }

  if (status === "rework") {
    return "Доработка";
  }

  return status || "-";
}

function statusPriority(status) {
  const priorities = {
    active: 0,
    rework: 1,
    inactive: 2,
  };

  return (
    priorities[
      String(status || "").toLowerCase()
    ] ?? 99
  );
}

export default function WorkerObjectsPage() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [msg, setMsg] =
    useState("");

  const [objects, setObjects] =
    useState([]);

  useEffect(() => {
    if (!auth || !db) {
      return;
    }

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          setMsg("");
          setLoading(true);

          if (!user) {
            router.replace("/login");
            return;
          }

          try {
            const userSnapshot =
              await getDoc(
                doc(
                  db,
                  "Users",
                  user.uid
                )
              );

            if (!userSnapshot.exists()) {
              await signOut(auth);
              router.replace("/login");
              return;
            }

            const userData =
              userSnapshot.data() || {};

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
              router.replace(
                "/dashboard"
              );
              return;
            }

            const activeQuery = query(
              collection(
                db,
                "Objects"
              ),
              where(
                "status",
                "==",
                "active"
              )
            );

            const reworkQuery = query(
              collection(
                db,
                "Objects"
              ),
              where(
                "status",
                "==",
                "rework"
              ),
              where(
                "visibleToWorkerUids",
                "array-contains",
                user.uid
              )
            );

            const [
              activeSnapshot,
              reworkSnapshot,
            ] = await Promise.all([
              getDocs(activeQuery),
              getDocs(reworkQuery),
            ]);

            const objectsMap =
              new Map();

            activeSnapshot.docs.forEach(
              (documentSnapshot) => {
                objectsMap.set(
                  documentSnapshot.id,
                  {
                    id:
                      documentSnapshot.id,
                    ...documentSnapshot.data(),
                  }
                );
              }
            );

            reworkSnapshot.docs.forEach(
              (documentSnapshot) => {
                objectsMap.set(
                  documentSnapshot.id,
                  {
                    id:
                      documentSnapshot.id,
                    ...documentSnapshot.data(),
                  }
                );
              }
            );

            const list = Array.from(
              objectsMap.values()
            )
              .filter((item) =>
                visibleForWorker(
                  item,
                  user.uid
                )
              )
              .sort((a, b) => {
                const priorityA =
                  statusPriority(
                    a?.status
                  );

                const priorityB =
                  statusPriority(
                    b?.status
                  );

                if (
                  priorityA !==
                  priorityB
                ) {
                  return (
                    priorityA -
                    priorityB
                  );
                }

                return String(
                  a?.name ||
                    a?.id ||
                    ""
                ).localeCompare(
                  String(
                    b?.name ||
                      b?.id ||
                      ""
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

    return () => unsubscribe();
  }, [router]);

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

            <div
              className={
                styles.subtitle
              }
            >
              Доступные объекты
              работника
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
            <div
              style={{
                opacity: 0.7,
              }}
            >
              Нет доступных объектов
            </div>
          ) : (
            objects.map((item) => {
              const workType =
                item.workType ===
                "roof"
                  ? "roof"
                  : "field";

              const roofFieldsCount =
                Number(
                  item.roofFieldCount
                ) ||
                (Array.isArray(
                  item.roofFields
                )
                  ? item.roofFields
                      .length
                  : 0);

              const totalPanels =
                Number(
                  item.mapPlanPanels
                ) || 0;

              const latitude =
                Number(item?.geo?.lat);

              const longitude =
                Number(item?.geo?.lng);

              const hasCoordinates =
                Number.isFinite(
                  latitude
                ) &&
                Number.isFinite(
                  longitude
                );

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
                      alignItems:
                        "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color:
                          "#1f2937",
                      }}
                    >
                      {item.name ||
                        item.id}
                    </div>

                    <span
                      style={{
                        padding:
                          "4px 8px",
                        borderRadius:
                          999,
                        fontSize: 12,
                        fontWeight: 800,

                        background:
                          workType ===
                          "roof"
                            ? "#e5eefc"
                            : "#e4f3e4",

                        color:
                          workType ===
                          "roof"
                            ? "#294f7f"
                            : "#285d2c",
                      }}
                    >
                      {workTypeLabel(
                        workType
                      )}
                    </span>
                  </div>

                  <div>
                    <b>Статус:</b>{" "}
                    {statusLabel(
                      item.status
                    )}
                  </div>

                  {workType === "roof" ? (
                    <div>
                      <b>
                        Поля крыши:
                      </b>{" "}
                      {roofFieldsCount},{" "}
                      <b>панелей:</b>{" "}
                      {totalPanels}
                    </div>
                  ) : (
                    <div>
                      <b>
                        Конструкций:
                      </b>{" "}
                      {Number(
                        item.mapPlanConstructions
                      ) || 0}
                      ,{" "}
                      <b>панелей:</b>{" "}
                      {totalPanels}
                    </div>
                  )}

                  <div>
                    <b>Координаты:</b>{" "}
                    {hasCoordinates
                      ? `${latitude.toFixed(
                          6
                        )}, ${longitude.toFixed(
                          6
                        )}`
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
                    {workType ===
                    "roof" ? (
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

                          alignItems:
                            "center",

                          justifyContent:
                            "center",

                          maxWidth: 260,
                          minHeight: 46,

                          textAlign:
                            "center",

                          background:
                            "#355f8d",
                        }}
                      >
                        Открыть карту
                        крыши
                      </Link>
                    ) : (
                      <Link
                        href={`/worker/object/${encodeURIComponent(
                          item.id
                        )}`}
                        className={
                          styles.actionButton
                        }
                        style={{
                          display:
                            "inline-flex",

                          alignItems:
                            "center",

                          justifyContent:
                            "center",

                          maxWidth: 240,
                          minHeight: 46,

                          textAlign:
                            "center",
                        }}
                      >
                        Открыть объект
                      </Link>
                    )}
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
