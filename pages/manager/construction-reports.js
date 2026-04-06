import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

function formatDateTime(value) {
  if (!value) return "-";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString("fi-FI");
    }

    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleString("fi-FI");
    }

    return String(value);
  } catch {
    return "-";
  }
}

function modeLabel(mode) {
  return String(mode || "") === "brigade" ? "Бригадный" : "Личный";
}

function normalizeUidList(report) {
  const set = new Set();

  if (Array.isArray(report?.mirrorUids)) {
    report.mirrorUids.forEach((uid) => {
      if (uid) set.add(String(uid));
    });
  }

  if (Array.isArray(report?.brigadeMemberUids)) {
    report.brigadeMemberUids.forEach((uid) => {
      if (uid) set.add(String(uid));
    });
  }

  if (report?.authorUid) set.add(String(report.authorUid));
  if (report?.workerUid) set.add(String(report.workerUid));

  return Array.from(set);
}

export default function ManagerConstructionReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [reports, setReports] = useState([]);
  const [deletingId, setDeletingId] = useState("");

  const [modeFilter, setModeFilter] = useState("all");
  const [objectFilter, setObjectFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [brigadeFilter, setBrigadeFilter] = useState("");

  const objectOptions = useMemo(() => {
    const map = new Map();
    reports.forEach((item) => {
      const objectId = String(item.objectId || "");
      const objectName = String(item.objectName || item.objectId || "");
      if (objectId) map.set(objectId, objectName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reports]);

  const authorOptions = useMemo(() => {
    const map = new Map();
    reports.forEach((item) => {
      const authorUid = String(item.authorUid || "");
      const authorName = String(item.authorName || item.authorUid || "");
      if (authorUid) map.set(authorUid, authorName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reports]);

  const brigadeOptions = useMemo(() => {
    const map = new Map();
    reports.forEach((item) => {
      const brigadeId = String(item.brigadeId || "");
      const brigadeName = String(item.brigadeName || item.brigadeId || "");
      if (brigadeId) map.set(brigadeId, brigadeName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (modeFilter !== "all" && String(item.reportMode || "") !== modeFilter) {
        return false;
      }

      if (objectFilter && String(item.objectId || "") !== objectFilter) {
        return false;
      }

      if (authorFilter && String(item.authorUid || "") !== authorFilter) {
        return false;
      }

      if (brigadeFilter && String(item.brigadeId || "") !== brigadeFilter) {
        return false;
      }

      return true;
    });
  }, [reports, modeFilter, objectFilter, authorFilter, brigadeFilter]);

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

        await loadReports();
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки отчётов");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadReports() {
    const snap = await getDocs(collection(db, "ConstructionReports"));

    const list = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .sort((a, b) => {
        const aSec = Number(a?.createdAt?.seconds || 0);
        const bSec = Number(b?.createdAt?.seconds || 0);
        return bSec - aSec;
      });

    setReports(list);
  }

  async function handleDeleteReport(report) {
    const yes = window.confirm(
      `Удалить отчёт по объекту "${report.objectName || report.objectId || "-"}"?`
    );
    if (!yes) return;

    setDeletingId(report.id);
    setMsg("");

    try {
      const batch = writeBatch(db);

      batch.delete(doc(db, "ConstructionReports", report.id));

      const mirrorUids = normalizeUidList(report);

      mirrorUids.forEach((uid) => {
        batch.delete(doc(db, "Users", uid, "ConstructionReports", report.id));
      });

      await batch.commit();

      setMsg("Отчёт удалён.");
      await loadReports();
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления отчёта");
    } finally {
      setDeletingId("");
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
              Отчёты по конструкциям
            </div>
            <div className={styles.subtitle}>
              Общий журнал личных и бригадных отчётов
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div style={filtersGridStyle}>
            <div>
              <div style={labelStyle}>Режим</div>
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="all">Все</option>
                <option value="personal">Личные</option>
                <option value="brigade">Бригадные</option>
              </select>
            </div>

            <div>
              <div style={labelStyle}>Объект</div>
              <select
                value={objectFilter}
                onChange={(e) => setObjectFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="">Все объекты</option>
                {objectOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Автор</div>
              <select
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="">Все авторы</option>
                {authorOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Бригада</div>
              <select
                value={brigadeFilter}
                onChange={(e) => setBrigadeFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="">Все бригады</option>
                {brigadeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {filteredReports.length === 0 ? (
            <div style={emptyStyle}>Отчётов пока нет</div>
          ) : (
            filteredReports.map((item) => (
              <div key={item.id} style={reportCardStyle}>
                <div style={reportHeaderStyle}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {item.objectName || item.objectId || "-"}
                  </div>

                  <div style={badgeWrapStyle}>
                    <span
                      style={{
                        ...badgeStyle,
                        background:
                          String(item.reportMode || "") === "brigade"
                            ? "rgba(59,130,246,0.14)"
                            : "rgba(34,197,94,0.14)",
                        border:
                          String(item.reportMode || "") === "brigade"
                            ? "1px solid rgba(59,130,246,0.35)"
                            : "1px solid rgba(34,197,94,0.35)",
                      }}
                    >
                      {modeLabel(item.reportMode)}
                    </span>
                  </div>
                </div>

                <div style={infoGridStyle}>
                  <div>
                    <b>Автор:</b> {item.authorName || "-"}
                  </div>

                  <div>
                    <b>Бригада:</b> {item.brigadeName || "-"}
                  </div>

                  <div>
                    <b>Конструкции:</b>{" "}
                    {Array.isArray(item.constructionNumbers)
                      ? item.constructionNumbers.join(", ")
                      : "-"}
                  </div>

                  <div>
                    <b>Статус конструкции:</b> {item.frameStatus || "-"}
                  </div>

                  <div>
                    <b>Статус панелей:</b> {item.panelStatus || "-"}
                  </div>

                  <div>
                    <b>Дата:</b> {formatDateTime(item.createdAt)}
                  </div>

                  <div>
                    <b>ID отчёта:</b> {item.reportId || item.id}
                  </div>
                </div>

                {Array.isArray(item.customCategoryIds) &&
                item.customCategoryIds.length > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <b>Доп. категории:</b> {item.customCategoryIds.join(", ")}
                  </div>
                ) : null}

                {item.comment ? (
                  <div style={commentStyle}>
                    <b>Комментарий:</b> {item.comment}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => handleDeleteReport(item)}
                    disabled={deletingId === item.id}
                    style={{
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 14px",
                      background: deletingId === item.id ? "#d9a9a9" : "#c94141",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: deletingId === item.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingId === item.id ? "Удаление..." : "Удалить отчёт"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <Link className={styles.link} href="/manager">
            ← Назад
          </Link>
        </div>
      </div>
    </main>
  );
}

const filtersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle = {
  fontWeight: 700,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(120, 90, 20, 0.16)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
};

const emptyStyle = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
  opacity: 0.8,
};

const reportCardStyle = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const reportHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 12,
};

const badgeWrapStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const badgeStyle = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
};

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 8,
};

const commentStyle = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(15,23,42,0.08)",
};
