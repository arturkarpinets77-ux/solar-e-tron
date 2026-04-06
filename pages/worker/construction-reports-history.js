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
  where,
} from "firebase/firestore";

import s from "../../styles/objectMap.module.css";

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

function uniqById(list) {
  const map = new Map();
  list.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

export default function WorkerConstructionReportsHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [brigades, setBrigades] = useState([]);
  const [reports, setReports] = useState([]);

  const [modeFilter, setModeFilter] = useState("all");
  const [objectFilter, setObjectFilter] = useState("");

  const objectOptions = useMemo(() => {
    const map = new Map();
    reports.forEach((item) => {
      const objectId = String(item.objectId || "");
      const objectName = String(item.objectName || item.objectId || "");
      if (objectId) map.set(objectId, objectName);
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

      return true;
    });
  }, [reports, modeFilter, objectFilter]);

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

        const displayName =
          `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
          userData.email ||
          user.email ||
          user.uid;

        setProfile({
          uid: user.uid,
          displayName,
        });

        const brigadeList = await loadMyBrigades(user.uid);
        await loadMyReports(user.uid, brigadeList);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки истории отчётов");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function loadMyBrigades(uid) {
    const q = query(
      collection(db, "Brigades"),
      where("memberUids", "array-contains", uid)
    );

    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setBrigades(list);
    return list;
  }

  async function loadMyReports(uid, brigadeList) {
    const personalSnap = await getDocs(
      query(collection(db, "ConstructionReports"), where("authorUid", "==", uid))
    );

    const personalList = personalSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const brigadeResults = [];

    for (const brigade of brigadeList) {
      const brigadeId = String(brigade.id || "");
      if (!brigadeId) continue;

      const snap = await getDocs(
        query(collection(db, "ConstructionReports"), where("brigadeId", "==", brigadeId))
      );

      snap.docs.forEach((d) => {
        brigadeResults.push({
          id: d.id,
          ...d.data(),
        });
      });
    }

    const merged = uniqById([...personalList, ...brigadeResults]).sort((a, b) => {
      const aSec = Number(a?.createdAt?.seconds || 0);
      const bSec = Number(b?.createdAt?.seconds || 0);
      return bSec - aSec;
    });

    setReports(merged);
  }

  function modeLabel(mode) {
    return String(mode || "") === "brigade" ? "Бригадный" : "Личный";
  }

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
            <h1 className={s.title}>Мои отчёты по конструкциям</h1>
            <div className={s.subtitle}>
              Личные и бригадные отчёты работника
            </div>
          </div>
        </div>

        <div style={filtersBoxStyle}>
          <div style={filtersGridStyle}>
            <div>
              <label style={labelStyle}>Режим</label>
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
              <label style={labelStyle}>Объект</label>
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
          </div>
        </div>

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
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
              </div>
            ))
          )}
        </div>

        <div className={s.footerLinks}>
          <Link href="/worker">← Назад</Link>
        </div>
      </div>
    </main>
  );
}

const filtersBoxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
  marginTop: 12,
};

const filtersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle = {
  display: "block",
  fontWeight: 700,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
  padding: "0 12px",
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
