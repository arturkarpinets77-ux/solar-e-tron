// pages/object-map/[id].js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db, storage } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import s from "../../styles/objectMap.module.css";

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

function roleLabel(role) {
  const value = String(role || "").toLowerCase();
  if (value === "worker") return "Работник";
  if (value === "director") return "Директор";
  if (value === "admin") return "Администратор";
  if (value === "accountant") return "Бухгалтер";
  return role || "-";
}

function getConstructionStatusMeta(status) {
  const value = String(status || "not_started");

  if (value === "frame_done") {
    return {
      label: "Конструкция собрана",
      color: "#3b82f6",
      background: "rgba(59,130,246,0.14)",
      border: "rgba(59,130,246,0.45)",
    };
  }

  if (value === "panels_installed_not_wrapped") {
    return {
      label: "Панели установлены, не обтянуты",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.16)",
      border: "rgba(245,158,11,0.45)",
    };
  }

  if (value === "done") {
    return {
      label: "Готово",
      color: "#22c55e",
      background: "rgba(34,197,94,0.16)",
      border: "rgba(34,197,94,0.45)",
    };
  }

  return {
    label: "Не начато",
    color: "#94a3b8",
    background: "rgba(148,163,184,0.14)",
    border: "rgba(148,163,184,0.45)",
  };
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

export default function ObjectMapPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objectItem, setObjectItem] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [constructionStates, setConstructionStates] = useState([]);

  const [imageUrlInput, setImageUrlInput] = useState("");
  const [mapFile, setMapFile] = useState(null);
  const [uploadingMap, setUploadingMap] = useState(false);

  const [planPanelsInput, setPlanPanelsInput] = useState("");
  const [planConstructionsInput, setPlanConstructionsInput] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [pendingPos, setPendingPos] = useState(null);

  const [editingMarkerId, setEditingMarkerId] = useState("");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerType, setMarkerType] = useState("custom");
  const [markerColor, setMarkerColor] = useState("#ff9800");
  const [markerPanelsCount, setMarkerPanelsCount] = useState("");
  const [markerConstructionsCount, setMarkerConstructionsCount] = useState("");
  const [markerNote, setMarkerNote] = useState("");

  const [selectedConstructionNumber, setSelectedConstructionNumber] = useState("");
  const [constructionStatus, setConstructionStatus] = useState("not_started");
  const [savingConstruction, setSavingConstruction] = useState(false);

  const canEdit = useMemo(() => {
    const role = String(profile?.role || "").toLowerCase();
    return role === "director" || role === "admin";
  }, [profile]);

  const constructionNumbers = useMemo(() => {
    return buildConstructionNumbers(
      objectItem?.constructionStartNumber,
      objectItem?.constructionEndNumber
    );
  }, [objectItem?.constructionStartNumber, objectItem?.constructionEndNumber]);

  const constructionStatesMap = useMemo(() => {
    const map = new Map();
    constructionStates.forEach((item) => {
      map.set(Number(item.number), item);
    });
    return map;
  }, [constructionStates]);

  const planConstructions = useMemo(() => {
    if (Number(objectItem?.mapPlanConstructions || 0) > 0) {
      return Number(objectItem?.mapPlanConstructions || 0);
    }
    return constructionNumbers.length;
  }, [objectItem?.mapPlanConstructions, constructionNumbers.length]);

  const planPanels = useMemo(() => {
    if (Number(objectItem?.mapPlanPanels || 0) > 0) {
      return Number(objectItem?.mapPlanPanels || 0);
    }

    const perConstruction = Number(objectItem?.panelsPerConstruction || 0);
    if (perConstruction > 0 && constructionNumbers.length > 0) {
      return perConstruction * constructionNumbers.length;
    }

    return 0;
  }, [
    objectItem?.mapPlanPanels,
    objectItem?.panelsPerConstruction,
    constructionNumbers.length,
  ]);

  const constructedCount = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      const status = String(item?.status || "not_started");
      return status !== "not_started";
    }).length;
  }, [constructionNumbers, constructionStatesMap]);

  const panelsNotWrappedConstructions = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      return String(item?.status || "") === "panels_installed_not_wrapped";
    }).length;
  }, [constructionNumbers, constructionStatesMap]);

  const doneConstructions = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      return String(item?.status || "") === "done";
    }).length;
  }, [constructionNumbers, constructionStatesMap]);

  const estimatedPanelsNotWrapped = useMemo(() => {
    const perConstruction = Number(objectItem?.panelsPerConstruction || 0);
    if (perConstruction <= 0) return 0;
    return panelsNotWrappedConstructions * perConstruction;
  }, [objectItem?.panelsPerConstruction, panelsNotWrappedConstructions]);

  const estimatedPanelsDone = useMemo(() => {
    const perConstruction = Number(objectItem?.panelsPerConstruction || 0);
    if (perConstruction <= 0) return 0;
    return doneConstructions * perConstruction;
  }, [objectItem?.panelsPerConstruction, doneConstructions]);

  useEffect(() => {
    if (!auth || !db || !id) return;

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
        const role = String(userData.role || "").trim().toLowerCase();
        const status = String(userData.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role === "accountant") {
          router.replace("/dashboard");
          return;
        }

        const nextProfile = {
          uid: user.uid,
          role,
          status,
          email: String(userData.email || user.email || "").trim(),
        };
        setProfile(nextProfile);

        const objectSnap = await getDoc(doc(db, "Objects", String(id)));
        if (!objectSnap.exists()) {
          setMsg("Объект не найден.");
          setObjectItem(null);
          setMarkers([]);
          setConstructionStates([]);
          return;
        }

        const obj = { id: objectSnap.id, ...objectSnap.data() };

        if (role === "worker" && !visibleForWorker(obj, user.uid)) {
          setMsg("У тебя нет доступа к карте этого объекта.");
          setObjectItem(null);
          setMarkers([]);
          setConstructionStates([]);
          return;
        }

        setObjectItem(obj);
        setImageUrlInput(String(obj.mapImageUrl || ""));
        setPlanPanelsInput(String(obj.mapPlanPanels || ""));
        setPlanConstructionsInput(String(obj.mapPlanConstructions || ""));

        await Promise.all([
          loadMarkers(String(id)),
          loadConstructionStates(String(id)),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки карты объекта");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, id]);

  async function loadMarkers(objectId) {
    const snap = await getDocs(collection(db, "Objects", objectId, "MapMarkers"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    list.sort((a, b) => {
      const aSec = a?.createdAt?.seconds || 0;
      const bSec = b?.createdAt?.seconds || 0;
      return aSec - bSec;
    });

    setMarkers(list);
  }

  async function loadConstructionStates(objectId) {
    const snap = await getDocs(
      collection(db, "Objects", objectId, "ConstructionStates")
    );

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    list.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    setConstructionStates(list);
  }

  function clearMarkerForm() {
    setEditingMarkerId("");
    setMarkerLabel("");
    setMarkerType("custom");
    setMarkerColor("#ff9800");
    setMarkerPanelsCount("");
    setMarkerConstructionsCount("");
    setMarkerNote("");
    setPendingPos(null);
  }

  async function handleUploadMapFile() {
    if (!canEdit || !objectItem?.id) return;
    if (!mapFile) {
      setMsg("Сначала выбери файл схемы.");
      return;
    }

    setUploadingMap(true);
    setMsg("");

    try {
      const ext = String(mapFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";

      const fileRef = ref(
        storage,
        `Objects/${objectItem.id}/Map/schema.${safeExt}`
      );

      await uploadBytes(fileRef, mapFile);
      const downloadUrl = await getDownloadURL(fileRef);

      await updateDoc(doc(db, "Objects", objectItem.id), {
        mapImageUrl: downloadUrl,
        updatedAt: serverTimestamp(),
      });

      const refreshed = await getDoc(doc(db, "Objects", objectItem.id));
      const nextObj = { id: refreshed.id, ...refreshed.data() };

      setObjectItem(nextObj);
      setImageUrlInput(String(nextObj.mapImageUrl || ""));
      setMapFile(null);
      setMsg("Схема объекта загружена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки схемы объекта");
    } finally {
      setUploadingMap(false);
    }
  }

  async function handleSaveMapSettings() {
    if (!canEdit || !objectItem?.id) return;

    setMsg("");
    try {
      await updateDoc(doc(db, "Objects", objectItem.id), {
        mapImageUrl: String(imageUrlInput || "").trim(),
        mapPlanPanels: Number(planPanelsInput || 0),
        mapPlanConstructions: Number(planConstructionsInput || 0),
        updatedAt: serverTimestamp(),
      });

      const refreshed = await getDoc(doc(db, "Objects", objectItem.id));
      const nextObj = { id: refreshed.id, ...refreshed.data() };
      setObjectItem(nextObj);
      setMsg("Настройки карты объекта сохранены.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения карты объекта");
    }
  }

  function handleImageClick(e) {
    if (!canEdit || !editMode) return;
    if (!objectItem?.mapImageUrl) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setPendingPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }

  async function handleSaveMarker() {
    if (!canEdit || !objectItem?.id) return;

    setMsg("");

    if (!editingMarkerId && !pendingPos) {
      setMsg("Сначала кликни по схеме, чтобы выбрать место для новой маркировки.");
      return;
    }

    if (!String(markerLabel || "").trim()) {
      setMsg("Укажи название маркировки.");
      return;
    }

    try {
      let markerId = editingMarkerId;
      let x = pendingPos?.x;
      let y = pendingPos?.y;

      if (editingMarkerId) {
        const existing = markers.find((m) => m.id === editingMarkerId);
        if (existing) {
          x = Number(existing.x);
          y = Number(existing.y);
        }
      } else {
        markerId = doc(collection(db, "Objects", objectItem.id, "MapMarkers")).id;
      }

      await setDoc(
        doc(db, "Objects", objectItem.id, "MapMarkers", markerId),
        {
          label: String(markerLabel).trim(),
          type: String(markerType || "custom"),
          color: String(markerColor || "#ff9800"),
          x: Number(x || 0),
          y: Number(y || 0),
          panelsCount: Number(markerPanelsCount || 0),
          constructionsCount: Number(markerConstructionsCount || 0),
          note: String(markerNote || "").trim(),
          updatedAt: serverTimestamp(),
          ...(editingMarkerId ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      await loadMarkers(objectItem.id);
      clearMarkerForm();
      setMsg("Маркировка сохранена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения маркировки");
    }
  }

  function handleEditMarker(marker) {
    setEditingMarkerId(marker.id);
    setMarkerLabel(String(marker.label || ""));
    setMarkerType(String(marker.type || "custom"));
    setMarkerColor(String(marker.color || "#ff9800"));
    setMarkerPanelsCount(String(marker.panelsCount || 0));
    setMarkerConstructionsCount(String(marker.constructionsCount || 0));
    setMarkerNote(String(marker.note || ""));
    setPendingPos({
      x: Number(marker.x || 0),
      y: Number(marker.y || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteMarker(markerId) {
    if (!canEdit || !objectItem?.id) return;

    setMsg("");
    try {
      await deleteDoc(doc(db, "Objects", objectItem.id, "MapMarkers", markerId));
      await loadMarkers(objectItem.id);

      if (editingMarkerId === markerId) {
        clearMarkerForm();
      }

      setMsg("Маркировка удалена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления маркировки");
    }
  }

  function handleSelectConstruction(number) {
    setSelectedConstructionNumber(String(number));

    const current = constructionStatesMap.get(Number(number));
    setConstructionStatus(String(current?.status || "not_started"));
  }

  async function handleSaveConstruction() {
    if (!canEdit || !objectItem?.id) return;

    const num = Number(selectedConstructionNumber);

    if (!Number.isFinite(num) || num < 1) {
      setMsg("Сначала выбери конструкцию.");
      return;
    }

    setSavingConstruction(true);
    setMsg("");

    try {
      await setDoc(
        doc(db, "Objects", objectItem.id, "ConstructionStates", String(num)),
        {
          number: num,
          status: String(constructionStatus || "not_started"),
          updatedAt: serverTimestamp(),
          updatedBy: profile?.uid || null,
        },
        { merge: true }
      );

      await loadConstructionStates(objectItem.id);
      setMsg("Статус конструкции сохранён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения статуса конструкции");
    } finally {
      setSavingConstruction(false);
    }
  }

  async function handleResetConstruction() {
    if (!canEdit || !objectItem?.id) return;

    const num = Number(selectedConstructionNumber);

    if (!Number.isFinite(num) || num < 1) {
      setMsg("Сначала выбери конструкцию.");
      return;
    }

    setSavingConstruction(true);
    setMsg("");

    try {
      await deleteDoc(
        doc(db, "Objects", objectItem.id, "ConstructionStates", String(num))
      );

      await loadConstructionStates(objectItem.id);
      setConstructionStatus("not_started");
      setMsg("Статус конструкции сброшен.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сброса статуса конструкции");
    } finally {
      setSavingConstruction(false);
    }
  }

  const installedPanelsByMarkers = useMemo(() => {
    return markers.reduce((sum, item) => sum + Number(item.panelsCount || 0), 0);
  }, [markers]);

  const installedConstructionsByMarkers = useMemo(() => {
    return markers.reduce(
      (sum, item) => sum + Number(item.constructionsCount || 0),
      0
    );
  }, [markers]);

  const selectedConstructionMeta = useMemo(() => {
    return getConstructionStatusMeta(constructionStatus);
  }, [constructionStatus]);

  if (loading) {
    return (
      <main className={s.page}>
        <div className={s.card}>Загрузка...</div>
      </main>
    );
  }

  if (!objectItem) {
    return (
      <main className={s.page}>
        <div className={s.card}>
          {msg || "Карта объекта не найдена"}
          <div className={s.footerLinks}>
            <Link href="/worker">Назад</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Карта объекта</h1>
            <div className={s.subtitle}>{objectItem.name || objectItem.id}</div>
            <div className={s.roleLine}>Роль: {roleLabel(profile?.role)}</div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div style={statBoxStyle}>
            <div style={statLabelStyle}>План панелей</div>
            <div style={statValueStyle}>{planPanels}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>Панелей готово</div>
            <div style={statValueStyle}>{estimatedPanelsDone}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>Панелей не обтянуты</div>
            <div style={statValueStyle}>{estimatedPanelsNotWrapped}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>План конструкций</div>
            <div style={statValueStyle}>{planConstructions}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>Конструкции начаты</div>
            <div style={statValueStyle}>{constructedCount}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>Конструкции готово</div>
            <div style={statValueStyle}>{doneConstructions}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.72)",
            border: "1px solid rgba(15,23,42,0.08)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div>
            <b>Диапазон конструкций:</b>{" "}
            {constructionNumbers.length
              ? `${constructionNumbers[0]} – ${
                  constructionNumbers[constructionNumbers.length - 1]
                }`
              : "-"}
          </div>
          <div>
            <b>Панелей на конструкцию:</b>{" "}
            {Number(objectItem?.panelsPerConstruction || 0)}
          </div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Старые ручные маркировки на карте оставлены. Новый блок
            <b> “Карта конструкций” </b>
            уже работает отдельно и будет основой для дальнейшей динамики.
          </div>
        </div>

        {canEdit ? (
          <div className={s.settingsBox}>
            <div className={s.sectionTitle}>Настройки карты объекта</div>

            <label className={s.label}>Загрузить файл схемы объекта</label>
            <input
              className={s.input}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(e) => setMapFile(e.target.files?.[0] || null)}
            />

            <div className={s.rowButtons}>
              <button
                className={s.primaryBtn}
                type="button"
                onClick={handleUploadMapFile}
                disabled={uploadingMap}
              >
                {uploadingMap ? "Загрузка..." : "Загрузить схему"}
              </button>
            </div>

            <label className={s.label} style={{ marginTop: 14 }}>
              Или вставь URL изображения схемы
            </label>
            <input
              className={s.input}
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="Вставь ссылку на изображение схемы"
            />

            <div className={s.row2}>
              <div>
                <label className={s.label}>План панелей</label>
                <input
                  className={s.input}
                  type="number"
                  min="0"
                  value={planPanelsInput}
                  onChange={(e) => setPlanPanelsInput(e.target.value)}
                  placeholder="Например: 5000"
                />
              </div>

              <div>
                <label className={s.label}>План конструкций</label>
                <input
                  className={s.input}
                  type="number"
                  min="0"
                  value={planConstructionsInput}
                  onChange={(e) => setPlanConstructionsInput(e.target.value)}
                  placeholder="Например: 300"
                />
              </div>
            </div>

            <div className={s.rowButtons}>
              <button
                className={s.primaryBtn}
                type="button"
                onClick={handleSaveMapSettings}
              >
                Сохранить настройки карты
              </button>

              <button
                className={s.secondaryBtn}
                type="button"
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? "Выключить режим разметки" : "Включить режим разметки"}
              </button>
            </div>
          </div>
        ) : null}

        {objectItem.mapImageUrl ? (
          <div className={s.mapWrap}>
            <div className={s.sectionTitle}>Схема объекта</div>

            {canEdit && editMode ? (
              <div className={s.helpText}>
                Кликни по схеме, чтобы выбрать место для новой маркировки.
              </div>
            ) : null}

            <div className={s.mapStage} onClick={handleImageClick}>
              <img
                src={objectItem.mapImageUrl}
                alt={objectItem.name || objectItem.id}
                className={s.mapImage}
              />

              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className={s.marker}
                  style={{
                    left: `${Number(marker.x || 0)}%`,
                    top: `${Number(marker.y || 0)}%`,
                    background: String(marker.color || "#ff9800"),
                  }}
                  title={`${marker.label || ""} | Панели: ${
                    marker.panelsCount || 0
                  } | Конструкции: ${marker.constructionsCount || 0}`}
                >
                  <span className={s.markerText}>{marker.label || "M"}</span>
                </div>
              ))}

              {canEdit && editMode && pendingPos ? (
                <div
                  className={s.pendingMarker}
                  style={{
                    left: `${Number(pendingPos.x || 0)}%`,
                    top: `${Number(pendingPos.y || 0)}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className={s.emptyBox}>Пока не задано изображение схемы объекта.</div>
        )}

        <div style={constructionSectionStyle}>
          <div style={sectionTitleStyle}>Карта конструкций</div>

          {constructionNumbers.length === 0 ? (
            <div style={{ opacity: 0.75 }}>
              Для этого объекта ещё не задан диапазон конструкций. Задай его в
              кабинете директора в разделе объектов.
            </div>
          ) : (
            <>
              <div style={legendWrapStyle}>
                {[
                  "not_started",
                  "frame_done",
                  "panels_installed_not_wrapped",
                  "done",
                ].map((status) => {
                  const meta = getConstructionStatusMeta(status);
                  return (
                    <div key={status} style={legendItemStyle}>
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: meta.background,
                          border: `1px solid ${meta.border}`,
                          display: "inline-block",
                        }}
                      />
                      <span>{meta.label}</span>
                    </div>
                  );
                })}
              </div>

              <div style={constructionGridStyle}>
                {constructionNumbers.map((num) => {
                  const current = constructionStatesMap.get(num);
                  const meta = getConstructionStatusMeta(current?.status);
                  const active = String(selectedConstructionNumber) === String(num);

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSelectConstruction(num)}
                      style={{
                        ...constructionCellStyle,
                        background: meta.background,
                        border: `1px solid ${active ? meta.color : meta.border}`,
                        boxShadow: active
                          ? `0 0 0 2px ${meta.color}33`
                          : "none",
                      }}
                      title={`${num} — ${meta.label}`}
                    >
                      <div style={constructionNumberStyle}>{num}</div>
                      <div style={constructionStatusStyle}>{meta.label}</div>
                    </button>
                  );
                })}
              </div>

              <div style={constructionEditorStyle}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>
                  {selectedConstructionNumber
                    ? `Выбрана конструкция № ${selectedConstructionNumber}`
                    : "Выбери конструкцию из списка выше"}
                </div>

                <div style={editorRowStyle}>
                  <div style={{ minWidth: 220 }}>
                    <label style={miniLabelStyle}>Статус конструкции</label>
                    <select
                      value={constructionStatus}
                      onChange={(e) => setConstructionStatus(e.target.value)}
                      disabled={!canEdit || !selectedConstructionNumber}
                      style={editorInputStyle}
                    >
                      <option value="not_started">Не начато</option>
                      <option value="frame_done">Конструкция собрана</option>
                      <option value="panels_installed_not_wrapped">
                        Панели установлены, не обтянуты
                      </option>
                      <option value="done">Готово</option>
                    </select>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: selectedConstructionMeta.background,
                      border: `1px solid ${selectedConstructionMeta.border}`,
                      color: selectedConstructionMeta.color,
                      fontWeight: 700,
                      minWidth: 220,
                    }}
                  >
                    Текущий выбор: {selectedConstructionMeta.label}
                  </div>
                </div>

                {canEdit ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <button
                      type="button"
                      className={s.primaryBtn}
                      onClick={handleSaveConstruction}
                      disabled={savingConstruction || !selectedConstructionNumber}
                    >
                      {savingConstruction
                        ? "Сохранение..."
                        : "Сохранить статус конструкции"}
                    </button>

                    <button
                      type="button"
                      className={s.secondaryBtn}
                      onClick={handleResetConstruction}
                      disabled={savingConstruction || !selectedConstructionNumber}
                    >
                      Сбросить статус
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.75 }}>
                    Работник сейчас видит карту конструкций только для просмотра.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {canEdit ? (
          <div className={s.editorBox}>
            <div className={s.sectionTitle}>
              {editingMarkerId ? "Редактирование маркировки" : "Новая маркировка"}
            </div>

            <div className={s.row2}>
              <div>
                <label className={s.label}>Название маркировки</label>
                <input
                  className={s.input}
                  value={markerLabel}
                  onChange={(e) => setMarkerLabel(e.target.value)}
                  placeholder="Например: Линия 3 / Ряд 5"
                />
              </div>

              <div>
                <label className={s.label}>Тип</label>
                <select
                  className={s.input}
                  value={markerType}
                  onChange={(e) => setMarkerType(e.target.value)}
                >
                  <option value="custom">Своя маркировка</option>
                  <option value="panels">Панели</option>
                  <option value="constructions">Конструкции</option>
                  <option value="mixed">Смешанная</option>
                </select>
              </div>
            </div>

            <div className={s.row2}>
              <div>
                <label className={s.label}>Цвет</label>
                <input
                  className={s.colorInput}
                  type="color"
                  value={markerColor}
                  onChange={(e) => setMarkerColor(e.target.value)}
                />
              </div>

              <div>
                <label className={s.label}>Панелей</label>
                <input
                  className={s.input}
                  type="number"
                  min="0"
                  value={markerPanelsCount}
                  onChange={(e) => setMarkerPanelsCount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className={s.row2}>
              <div>
                <label className={s.label}>Конструкций</label>
                <input
                  className={s.input}
                  type="number"
                  min="0"
                  value={markerConstructionsCount}
                  onChange={(e) => setMarkerConstructionsCount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div>
                <label className={s.label}>Примечание</label>
                <input
                  className={s.input}
                  value={markerNote}
                  onChange={(e) => setMarkerNote(e.target.value)}
                  placeholder="Например: собрано, но не обтянуто"
                />
              </div>
            </div>

            <div className={s.rowButtons}>
              <button className={s.primaryBtn} type="button" onClick={handleSaveMarker}>
                {editingMarkerId ? "Сохранить маркировку" : "Добавить маркировку"}
              </button>

              <button className={s.secondaryBtn} type="button" onClick={clearMarkerForm}>
                Очистить форму
              </button>
            </div>
          </div>
        ) : null}

        <div className={s.listBox}>
          <div className={s.sectionTitle}>Маркировки</div>

          {markers.length === 0 ? (
            <div className={s.emptyText}>Маркировок пока нет.</div>
          ) : (
            <div className={s.markerList}>
              {markers.map((marker) => (
                <div className={s.markerCard} key={marker.id}>
                  <div className={s.markerCardTop}>
                    <div className={s.markerCardLeft}>
                      <span
                        className={s.colorDot}
                        style={{ background: String(marker.color || "#ff9800") }}
                      />
                      <div>
                        <div className={s.markerName}>{marker.label || "-"}</div>
                        <div className={s.markerMeta}>
                          Тип: {marker.type || "-"} | Панели: {marker.panelsCount || 0} |
                          Конструкции: {marker.constructionsCount || 0}
                        </div>
                        {marker.note ? (
                          <div className={s.markerNote}>Примечание: {marker.note}</div>
                        ) : null}
                      </div>
                    </div>

                    {canEdit ? (
                      <div className={s.cardBtns}>
                        <button
                          className={s.smallBtn}
                          type="button"
                          onClick={() => handleEditMarker(marker)}
                        >
                          Изменить
                        </button>
                        <button
                          className={s.smallDangerBtn}
                          type="button"
                          onClick={() => handleDeleteMarker(marker.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.72)",
            border: "1px solid rgba(15,23,42,0.08)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Старые счётчики по маркировкам</div>
          <div>Панели по ручным маркировкам: {installedPanelsByMarkers}</div>
          <div>Конструкции по ручным маркировкам: {installedConstructionsByMarkers}</div>
        </div>

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div className={s.footerLinks}>
          {String(profile?.role || "").toLowerCase() === "worker" ? (
            <Link href={`/worker/object/${encodeURIComponent(objectItem.id)}`}>
              ← К объекту
            </Link>
          ) : (
            <Link href="/manager/objects">← К объектам</Link>
          )}
        </div>
      </div>
    </main>
  );
}

const statBoxStyle = {
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.76)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const statLabelStyle = {
  fontSize: 13,
  opacity: 0.75,
  marginBottom: 8,
  fontWeight: 700,
};

const statValueStyle = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
};

const constructionSectionStyle = {
  marginTop: 24,
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(15,23,42,0.10)",
};

const sectionTitleStyle = {
  fontSize: 24,
  fontWeight: 900,
  marginBottom: 14,
};

const legendWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 14,
};

const legendItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 13,
};

const constructionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
};

const constructionCellStyle = {
  borderRadius: 14,
  minHeight: 90,
  padding: 10,
  textAlign: "left",
  cursor: "pointer",
  transition: "0.15s ease",
};

const constructionNumberStyle = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 8,
};

const constructionStatusStyle = {
  fontSize: 12,
  lineHeight: 1.3,
  opacity: 0.9,
};

const constructionEditorStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const editorRowStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "end",
};

const miniLabelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
};

const editorInputStyle = {
  width: "100%",
  minWidth: 220,
  height: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.18)",
  background: "#fff",
  padding: "0 12px",
  outline: "none",
};
