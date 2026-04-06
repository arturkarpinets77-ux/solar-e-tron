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
  where,
  writeBatch,
} from "firebase/firestore";

import s from "../../styles/objectMap.module.css";

const BASE_CATEGORY_DEFAULTS = [
  {
    id: "frame_built_not_wrapped",
    code: "frame_built_not_wrapped",
    name: "Конструкция собрана, не обтянута",
    color: "#3b82f6",
    type: "base",
    sortOrder: 10,
  },
  {
    id: "frame_built",
    code: "frame_built",
    name: "Конструкция собрана",
    color: "#2563eb",
    type: "base",
    sortOrder: 20,
  },
  {
    id: "panel_installed_not_wrapped",
    code: "panel_installed_not_wrapped",
    name: "Панели установлены, не обтянуты",
    color: "#f59e0b",
    type: "base",
    sortOrder: 30,
  },
  {
    id: "panel_wrapped",
    code: "panel_wrapped",
    name: "Панели обтянуты",
    color: "#14b8a6",
    type: "base",
    sortOrder: 40,
  },
];

function mergeCategories(dbCategories) {
  const byCode = new Map();
  dbCategories.forEach((item) => {
    if (item.code) byCode.set(item.code, item);
  });

  const base = BASE_CATEGORY_DEFAULTS.map((item) => {
    const saved = byCode.get(item.code);
    return saved
      ? {
          ...item,
          ...saved,
          id: saved.id || item.id,
        }
      : item;
  });

  const custom = dbCategories
    .filter((item) => String(item.type || "") === "custom")
    .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));

  return [...base, ...custom];
}

function buildConstructionNumbers(start, end) {
  const startNum = Number(start);
  const endNum = Number(end);

  if (
    !Number.isFinite(startNum) ||
    !Number.isFinite(endNum) ||
    startNum < 1 ||
    endNum < startNum
  ) {
    return [];
  }

  const list = [];
  for (let i = startNum; i <= endNum; i += 1) {
    list.push(i);
  }
  return list;
}

export default function WorkerConstructionReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [brigades, setBrigades] = useState([]);

  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [selectedObject, setSelectedObject] = useState(null);
  const [constructionCategories, setConstructionCategories] = useState([]);

  const [reportMode, setReportMode] = useState("personal");
  const [selectedBrigadeId, setSelectedBrigadeId] = useState("");

  const [selectedConstructionNumbers, setSelectedConstructionNumbers] = useState([]);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [frameStatus, setFrameStatus] = useState("not_started");
  const [panelStatus, setPanelStatus] = useState("not_started");
  const [selectedCustomCategoryIds, setSelectedCustomCategoryIds] = useState([]);
  const [comment, setComment] = useState("");

  const [saving, setSaving] = useState(false);

  const constructionNumbers = useMemo(() => {
    return buildConstructionNumbers(
      selectedObject?.constructionStartNumber,
      selectedObject?.constructionEndNumber
    );
  }, [selectedObject?.constructionStartNumber, selectedObject?.constructionEndNumber]);

  const customCategories = useMemo(() => {
    return constructionCategories.filter(
      (item) => String(item.type || "") === "custom"
    );
  }, [constructionCategories]);

  const availableBrigades = useMemo(() => {
    if (!selectedObjectId) return [];
    return brigades.filter(
      (item) => String(item.objectId || "") === String(selectedObjectId)
    );
  }, [brigades, selectedObjectId]);

  const selectedBrigade = useMemo(() => {
    return brigades.find((b) => b.id === selectedBrigadeId) || null;
  }, [brigades, selectedBrigadeId]);

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

        const nextProfile = {
          uid: user.uid,
          email: String(userData.email || user.email || "").trim(),
          displayName,
        };

        setProfile(nextProfile);

        await Promise.all([
          loadObjectsForWorker(user.uid),
          loadBrigades(user.uid),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки страницы отчётов");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!selectedObjectId) {
      setSelectedObject(null);
      setConstructionCategories(mergeCategories([]));
      setSelectedConstructionNumbers([]);
      return;
    }

    loadSelectedObject(selectedObjectId);
  }, [selectedObjectId]);

  useEffect(() => {
    if (
      selectedBrigadeId &&
      !availableBrigades.some((item) => item.id === selectedBrigadeId)
    ) {
      setSelectedBrigadeId("");
    }
  }, [availableBrigades, selectedBrigadeId]);

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

      if (list.length === 1) {
        setSelectedObjectId(list[0].id);
      }
    } catch (e) {
      setObjects([]);
      setMsg(e?.message || "Ошибка загрузки объектов");
    }
  }

  async function loadBrigades(uid) {
    try {
      const q = query(
        collection(db, "Brigades"),
        where("memberUids", "array-contains", uid)
      );
      const snap = await getDocs(q);

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "ru")
        );

      setBrigades(list);

      if (list.length === 0) {
        setReportMode("personal");
        setSelectedBrigadeId("");
      }
    } catch {
      setBrigades([]);
    }
  }

  async function loadSelectedObject(objectId) {
    try {
      const snap = await getDoc(doc(db, "Objects", objectId));
      if (!snap.exists()) {
        setSelectedObject(null);
        setConstructionCategories(mergeCategories([]));
        return;
      }

      const obj = { id: snap.id, ...snap.data() };
      setSelectedObject(obj);

      const catSnap = await getDocs(
        collection(db, "Objects", objectId, "ConstructionCategories")
      );

      const dbCats = catSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setConstructionCategories(mergeCategories(dbCats));
      setSelectedConstructionNumbers([]);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки объекта");
    }
  }

  function toggleConstruction(num) {
    setSelectedConstructionNumbers((prev) =>
      prev.includes(num)
        ? prev.filter((x) => x !== num)
        : [...prev, num].sort((a, b) => a - b)
    );
  }

  function addRange() {
    const from = Number(rangeFrom);
    const to = Number(rangeTo);

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setMsg("Укажи диапазон конструкций.");
      return;
    }

    if (to < from) {
      setMsg("Конечный номер не может быть меньше начального.");
      return;
    }

    const allowed = new Set(constructionNumbers);
    const picked = [];

    for (let i = from; i <= to; i += 1) {
      if (allowed.has(i)) picked.push(i);
    }

    if (picked.length === 0) {
      setMsg("В этом диапазоне нет конструкций объекта.");
      return;
    }

    setSelectedConstructionNumbers((prev) =>
      Array.from(new Set([...prev, ...picked])).sort((a, b) => a - b)
    );
    setMsg("");
  }

  function clearConstructionSelection() {
    setSelectedConstructionNumbers([]);
    setRangeFrom("");
    setRangeTo("");
  }

  function toggleCustomCategory(categoryId) {
    setSelectedCustomCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((x) => x !== categoryId)
        : [...prev, categoryId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");

    if (!selectedObjectId || !selectedObject) {
      setMsg("Сначала выбери объект.");
      return;
    }

    if (selectedConstructionNumbers.length === 0) {
      setMsg("Выбери хотя бы одну конструкцию.");
      return;
    }

    if (reportMode === "brigade" && !selectedBrigadeId) {
      setMsg("Для бригадного отчёта выбери бригаду.");
      return;
    }

    if (
      reportMode === "brigade" &&
      selectedBrigade &&
      String(selectedBrigade.objectId || "") !== String(selectedObjectId)
    ) {
      setMsg("Эта бригада привязана к другому объекту.");
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const reportRef = doc(collection(db, "ConstructionReports"));
      const reportId = reportRef.id;

      const mirrorTargets =
        reportMode === "brigade" && Array.isArray(selectedBrigade?.memberUids)
          ? selectedBrigade.memberUids
          : [profile.uid];

      const reportPayload = {
        reportId,
        objectId: selectedObject.id,
        objectName: String(selectedObject.name || selectedObject.id),
        reportMode,
        brigadeId: reportMode === "brigade" ? selectedBrigadeId : null,
        brigadeName:
          reportMode === "brigade"
            ? String(selectedBrigade?.name || "")
            : null,
        brigadeObjectId:
          reportMode === "brigade"
            ? String(selectedBrigade?.objectId || "")
            : null,
        brigadeObjectName:
          reportMode === "brigade"
            ? String(selectedBrigade?.objectName || "")
            : null,
        brigadeMemberUids:
          reportMode === "brigade" && Array.isArray(selectedBrigade?.memberUids)
            ? selectedBrigade.memberUids
            : [],
        authorUid: profile.uid,
        authorName: profile.displayName,
        workerUid: reportMode === "personal" ? profile.uid : null,
        workerName: reportMode === "personal" ? profile.displayName : null,
        mirrorUids: mirrorTargets,
        constructionNumbers: selectedConstructionNumbers,
        frameStatus,
        panelStatus,
        customCategoryIds: selectedCustomCategoryIds,
        comment: String(comment || "").trim(),
        createdAt: serverTimestamp(),
      };

      batch.set(reportRef, reportPayload);

      selectedConstructionNumbers.forEach((num) => {
        const ref = doc(
          db,
          "Objects",
          selectedObject.id,
          "ConstructionStates",
          String(num)
        );

        batch.set(
          ref,
          {
            number: num,
            frameStatus,
            panelStatus,
            customCategoryIds: selectedCustomCategoryIds,
            updatedAt: serverTimestamp(),
            updatedBy: profile.uid,
            updatedByName: profile.displayName,
            lastReportId: reportId,
            lastReportMode: reportMode,
            lastBrigadeId: reportMode === "brigade" ? selectedBrigadeId : null,
            lastBrigadeName:
              reportMode === "brigade" ? String(selectedBrigade?.name || "") : null,
          },
          { merge: true }
        );
      });

      mirrorTargets.forEach((uid) => {
        const mirrorRef = doc(db, "Users", uid, "ConstructionReports", reportId);
        batch.set(mirrorRef, reportPayload, { merge: true });
      });

      await batch.commit();

      setComment("");
      setSelectedConstructionNumbers([]);
      setRangeFrom("");
      setRangeTo("");
      setSelectedCustomCategoryIds([]);
      setFrameStatus("not_started");
      setPanelStatus("not_started");

      setMsg(
        reportMode === "brigade"
          ? "Бригадный отчёт сохранён. Карта конструкций обновлена."
          : "Личный отчёт сохранён. Карта конструкций обновлена."
      );
    } catch (e2) {
      setMsg(e2?.message || "Ошибка сохранения отчёта");
    } finally {
      setSaving(false);
    }
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
            <h1 className={s.title}>Отчёт по конструкциям</h1>
            <div className={s.subtitle}>
              Личный или бригадный отчёт работника
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={boxStyle}>
            <div style={sectionTitleStyle}>Основные данные</div>

            <div style={grid2Style}>
              <div>
                <label style={labelStyle}>Объект</label>
                <select
                  value={selectedObjectId}
                  onChange={(e) => setSelectedObjectId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Выбери объект</option>
                  {objects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Режим отчёта</label>
                <select
                  value={reportMode}
                  onChange={(e) => setReportMode(e.target.value)}
                  style={inputStyle}
                >
                  <option value="personal">Личный отчёт</option>
                  <option value="brigade" disabled={brigades.length === 0}>
                    Бригадный отчёт
                  </option>
                </select>
              </div>
            </div>

            {reportMode === "brigade" ? (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Бригада</label>
                <select
                  value={selectedBrigadeId}
                  onChange={(e) => setSelectedBrigadeId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Выбери бригаду</option>
                  {availableBrigades.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.id}
                    </option>
                  ))}
                </select>

                {selectedObjectId && availableBrigades.length === 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    Для выбранного объекта у тебя нет привязанной бригады.
                  </div>
                ) : null}
              </div>
            ) : null}

            {objects.length === 0 ? (
              <div style={{ marginTop: 12, opacity: 0.8 }}>
                Нет доступных объектов для отчёта.
              </div>
            ) : null}
          </div>

          <div style={boxStyle}>
            <div style={sectionTitleStyle}>Конструкции</div>

            <div style={grid3Style}>
              <div>
                <label style={labelStyle}>Диапазон: от</label>
                <input
                  type="number"
                  min="1"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Диапазон: до</label>
                <input
                  type="number"
                  min="1"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ alignSelf: "end" }}>
                <button
                  type="button"
                  className={s.secondaryBtn}
                  onClick={addRange}
                >
                  Добавить диапазон
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                className={s.secondaryBtn}
                onClick={() =>
                  setSelectedConstructionNumbers([...constructionNumbers])
                }
              >
                Выбрать все
              </button>

              <button
                type="button"
                className={s.secondaryBtn}
                onClick={clearConstructionSelection}
              >
                Очистить выбор
              </button>
            </div>

            <div style={constructionGridStyle}>
              {constructionNumbers.length === 0 ? (
                <div style={{ opacity: 0.7 }}>
                  Для объекта не задан диапазон конструкций.
                </div>
              ) : (
                constructionNumbers.map((num) => {
                  const selected = selectedConstructionNumbers.includes(num);

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => toggleConstruction(num)}
                      style={{
                        ...constructionBtnStyle,
                        background: selected
                          ? "rgba(59,130,246,0.14)"
                          : "rgba(255,255,255,0.92)",
                        border: selected
                          ? "1px solid rgba(59,130,246,0.50)"
                          : "1px solid rgba(15,23,42,0.10)",
                      }}
                    >
                      {num}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={boxStyle}>
            <div style={sectionTitleStyle}>Статусы для выбранных конструкций</div>

            <div style={grid2Style}>
              <div>
                <label style={labelStyle}>Статус конструкции</label>
                <select
                  value={frameStatus}
                  onChange={(e) => setFrameStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="not_started">Не начато</option>
                  <option value="built_not_wrapped">
                    {constructionCategories.find(
                      (x) => x.code === "frame_built_not_wrapped"
                    )?.name || "Конструкция собрана, не обтянута"}
                  </option>
                  <option value="built">
                    {constructionCategories.find((x) => x.code === "frame_built")
                      ?.name || "Конструкция собрана"}
                  </option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Статус панелей</label>
                <select
                  value={panelStatus}
                  onChange={(e) => setPanelStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="not_started">Не начато</option>
                  <option value="installed_not_wrapped">
                    {constructionCategories.find(
                      (x) => x.code === "panel_installed_not_wrapped"
                    )?.name || "Панели установлены, не обтянуты"}
                  </option>
                  <option value="wrapped">
                    {constructionCategories.find((x) => x.code === "panel_wrapped")
                      ?.name || "Панели обтянуты"}
                  </option>
                </select>
              </div>
            </div>

            {customCategories.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>Дополнительные категории</div>

                <div style={customWrapStyle}>
                  {customCategories.map((item) => (
                    <label key={item.id} style={customItemStyle}>
                      <input
                        type="checkbox"
                        checked={selectedCustomCategoryIds.includes(item.id)}
                        onChange={() => toggleCustomCategory(item.id)}
                      />
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: item.color || "#a855f7",
                          display: "inline-block",
                        }}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Комментарий</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: завершили 3 конструкции, 2 ждут подключения"
                style={textareaStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              className={s.primaryBtn}
              disabled={saving}
            >
              {saving ? "Сохранение..." : "Сохранить отчёт"}
            </button>
          </div>
        </form>

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div className={s.footerLinks}>
          <Link href="/worker">← Назад</Link>
        </div>
      </div>
    </main>
  );
}

const boxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const sectionTitleStyle = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 12,
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const grid3Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

const textareaStyle = {
  width: "100%",
  minHeight: 100,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
  padding: "10px 12px",
  outline: "none",
  resize: "vertical",
};

const constructionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const constructionBtnStyle = {
  minHeight: 50,
  borderRadius: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const customWrapStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const customItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 13,
};
