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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

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

function getCategoryByCode(categories, code) {
  return categories.find((item) => item.code === code) || null;
}

function getFinalConstructionState(item) {
  const frameStatus = String(item?.frameStatus || "not_started");
  const panelStatus = String(item?.panelStatus || "not_started");
  const customCount = Array.isArray(item?.customCategoryIds)
    ? item.customCategoryIds.length
    : 0;

  if (frameStatus === "built" && panelStatus === "wrapped") {
    return "done";
  }

  if (
    frameStatus !== "not_started" ||
    panelStatus !== "not_started" ||
    customCount > 0
  ) {
    return "in_progress";
  }

  return "not_started";
}

function getCardVisual(item, categories) {
  const finalState = getFinalConstructionState(item);

  if (finalState === "done") {
    return {
      label: "Готова",
      background: "rgba(34,197,94,0.16)",
      border: "rgba(34,197,94,0.50)",
      accent: "#22c55e",
    };
  }

  if (finalState === "not_started") {
    return {
      label: "Не начато",
      background: "rgba(148,163,184,0.12)",
      border: "rgba(148,163,184,0.35)",
      accent: "#94a3b8",
    };
  }

  const panelStatus = String(item?.panelStatus || "not_started");
  const frameStatus = String(item?.frameStatus || "not_started");
  const customIds = Array.isArray(item?.customCategoryIds)
    ? item.customCategoryIds
    : [];

  if (panelStatus === "installed_not_wrapped") {
    const cat = getCategoryByCode(categories, "panel_installed_not_wrapped");
    return {
      label: "В работе",
      background: hexToSoft(cat?.color || "#f59e0b"),
      border: hexToBorder(cat?.color || "#f59e0b"),
      accent: cat?.color || "#f59e0b",
    };
  }

  if (panelStatus === "wrapped") {
    const cat = getCategoryByCode(categories, "panel_wrapped");
    return {
      label: "В работе",
      background: hexToSoft(cat?.color || "#14b8a6"),
      border: hexToBorder(cat?.color || "#14b8a6"),
      accent: cat?.color || "#14b8a6",
    };
  }

  if (frameStatus === "built") {
    const cat = getCategoryByCode(categories, "frame_built");
    return {
      label: "В работе",
      background: hexToSoft(cat?.color || "#2563eb"),
      border: hexToBorder(cat?.color || "#2563eb"),
      accent: cat?.color || "#2563eb",
    };
  }

  if (frameStatus === "built_not_wrapped") {
    const cat = getCategoryByCode(categories, "frame_built_not_wrapped");
    return {
      label: "В работе",
      background: hexToSoft(cat?.color || "#3b82f6"),
      border: hexToBorder(cat?.color || "#3b82f6"),
      accent: cat?.color || "#3b82f6",
    };
  }

  if (customIds.length > 0) {
    const custom = categories.find((item) => item.id === customIds[0]);
    return {
      label: "В работе",
      background: hexToSoft(custom?.color || "#7c3aed"),
      border: hexToBorder(custom?.color || "#7c3aed"),
      accent: custom?.color || "#7c3aed",
    };
  }

  return {
    label: "Не начато",
    background: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.35)",
    accent: "#94a3b8",
  };
}

function hexToSoft(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "rgba(148,163,184,0.12)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
}

function hexToBorder(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "rgba(148,163,184,0.35)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`;
}

function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "").trim();
  if (raw.length !== 6) return null;

  const bigint = parseInt(raw, 16);
  if (Number.isNaN(bigint)) return null;

  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export default function ObjectMapPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objectItem, setObjectItem] = useState(null);

  const [constructionStates, setConstructionStates] = useState([]);
  const [constructionCategories, setConstructionCategories] = useState([]);

  const [imageUrlInput, setImageUrlInput] = useState("");
  const [mapFile, setMapFile] = useState(null);
  const [uploadingMap, setUploadingMap] = useState(false);

  const [planPanelsInput, setPlanPanelsInput] = useState("");
  const [planConstructionsInput, setPlanConstructionsInput] = useState("");

  const [selectedConstructionNumber, setSelectedConstructionNumber] = useState("");
  const [frameStatus, setFrameStatus] = useState("not_started");
  const [panelStatus, setPanelStatus] = useState("not_started");
  const [selectedCustomCategoryIds, setSelectedCustomCategoryIds] = useState([]);
  const [savingConstruction, setSavingConstruction] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#a855f7");
  const [savingCategoryId, setSavingCategoryId] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

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

  const customCategories = useMemo(() => {
    return constructionCategories.filter(
      (item) => String(item.type || "") === "custom"
    );
  }, [constructionCategories]);

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

  const doneConstructions = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      return getFinalConstructionState(item) === "done";
    }).length;
  }, [constructionNumbers, constructionStatesMap]);

  const workingConstructions = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      return getFinalConstructionState(item) === "in_progress";
    }).length;
  }, [constructionNumbers, constructionStatesMap]);

  const panelsNotWrappedConstructions = useMemo(() => {
    return constructionNumbers.filter((num) => {
      const item = constructionStatesMap.get(num);
      return String(item?.panelStatus || "") === "installed_not_wrapped";
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
          setConstructionStates([]);
          setConstructionCategories(mergeCategories([]));
          return;
        }

        const obj = { id: objectSnap.id, ...objectSnap.data() };

        if (role === "worker" && !visibleForWorker(obj, user.uid)) {
          setMsg("У тебя нет доступа к карте этого объекта.");
          setObjectItem(null);
          setConstructionStates([]);
          setConstructionCategories(mergeCategories([]));
          return;
        }

        setObjectItem(obj);
        setImageUrlInput(String(obj.mapImageUrl || ""));
        setPlanPanelsInput(String(obj.mapPlanPanels || ""));
        setPlanConstructionsInput(String(obj.mapPlanConstructions || ""));

        await Promise.all([
          loadConstructionStates(String(id)),
          loadConstructionCategories(String(id), role === "director" || role === "admin"),
        ]);
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки карты объекта");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, id]);

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

  async function loadConstructionCategories(objectId, shouldSeed) {
    const colRef = collection(db, "Objects", objectId, "ConstructionCategories");
    let snap = await getDocs(colRef);

    if (snap.empty && shouldSeed) {
      for (const item of BASE_CATEGORY_DEFAULTS) {
        await setDoc(doc(db, "Objects", objectId, "ConstructionCategories", item.id), {
          code: item.code,
          name: item.name,
          color: item.color,
          type: item.type,
          sortOrder: item.sortOrder,
          updatedAt: serverTimestamp(),
        });
      }
      snap = await getDocs(colRef);
    }

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setConstructionCategories(mergeCategories(list));
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

  function handleSelectConstruction(number) {
    const num = Number(number);
    const current = constructionStatesMap.get(num);

    setSelectedConstructionNumber(String(num));
    setFrameStatus(String(current?.frameStatus || "not_started"));
    setPanelStatus(String(current?.panelStatus || "not_started"));
    setSelectedCustomCategoryIds(
      Array.isArray(current?.customCategoryIds) ? current.customCategoryIds : []
    );
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
          frameStatus: String(frameStatus || "not_started"),
          panelStatus: String(panelStatus || "not_started"),
          customCategoryIds: Array.isArray(selectedCustomCategoryIds)
            ? selectedCustomCategoryIds
            : [],
          updatedAt: serverTimestamp(),
          updatedBy: profile?.uid || null,
        },
        { merge: true }
      );

      await loadConstructionStates(objectItem.id);
      setMsg("Состояние конструкции сохранено.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения конструкции");
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
      setFrameStatus("not_started");
      setPanelStatus("not_started");
      setSelectedCustomCategoryIds([]);
      setMsg("Состояние конструкции сброшено.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сброса конструкции");
    } finally {
      setSavingConstruction(false);
    }
  }

  function toggleCustomCategory(categoryId) {
    setSelectedCustomCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((item) => item !== categoryId)
        : [...prev, categoryId]
    );
  }

  function updateCategoryLocal(categoryId, patch) {
    setConstructionCategories((prev) =>
      prev.map((item) =>
        item.id === categoryId
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  }

  async function handleSaveCategory(category) {
    if (!canEdit || !objectItem?.id) return;

    setSavingCategoryId(category.id);
    setMsg("");

    try {
      await setDoc(
        doc(db, "Objects", objectItem.id, "ConstructionCategories", category.id),
        {
          code: category.code || null,
          name: String(category.name || "").trim(),
          color: String(category.color || "#a855f7"),
          type: String(category.type || "custom"),
          sortOrder: Number(category.sortOrder || 999),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadConstructionCategories(objectItem.id, false);
      setMsg("Маркировка сохранена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения маркировки");
    } finally {
      setSavingCategoryId("");
    }
  }

  async function handleDeleteCategory(category) {
    if (!canEdit || !objectItem?.id) return;
    if (String(category.type || "") !== "custom") return;

    const yes = window.confirm(`Удалить категорию "${category.name}"?`);
    if (!yes) return;

    setSavingCategoryId(category.id);
    setMsg("");

    try {
      await deleteDoc(
        doc(db, "Objects", objectItem.id, "ConstructionCategories", category.id)
      );

      setSelectedCustomCategoryIds((prev) =>
        prev.filter((item) => item !== category.id)
      );

      await loadConstructionCategories(objectItem.id, false);
      setMsg("Категория удалена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления категории");
    } finally {
      setSavingCategoryId("");
    }
  }

  async function handleCreateCategory() {
    if (!canEdit || !objectItem?.id) return;

    const name = String(newCategoryName || "").trim();
    if (!name) {
      setMsg("Укажи название новой категории.");
      return;
    }

    setCreatingCategory(true);
    setMsg("");

    try {
      const newRef = doc(
        collection(db, "Objects", objectItem.id, "ConstructionCategories")
      );

      await setDoc(newRef, {
        code: null,
        name,
        color: String(newCategoryColor || "#a855f7"),
        type: "custom",
        sortOrder: 1000 + Date.now(),
        updatedAt: serverTimestamp(),
      });

      setNewCategoryName("");
      setNewCategoryColor("#a855f7");
      await loadConstructionCategories(objectItem.id, false);
      setMsg("Новая категория добавлена.");
    } catch (e) {
      setMsg(e?.message || "Ошибка добавления категории");
    } finally {
      setCreatingCategory(false);
    }
  }

  const selectedConstructionVisual = useMemo(() => {
    return getCardVisual(
      {
        frameStatus,
        panelStatus,
        customCategoryIds: selectedCustomCategoryIds,
      },
      constructionCategories
    );
  }, [frameStatus, panelStatus, selectedCustomCategoryIds, constructionCategories]);

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

        <div style={statsGridStyle}>
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
            <div style={statLabelStyle}>Конструкции в работе</div>
            <div style={statValueStyle}>{workingConstructions}</div>
          </div>

          <div style={statBoxStyle}>
            <div style={statLabelStyle}>Конструкции готово</div>
            <div style={statValueStyle}>{doneConstructions}</div>
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
                  placeholder="Например: 96"
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
            </div>
          </div>
        ) : null}

        {objectItem.mapImageUrl ? (
          <div className={s.mapWrap}>
            <div className={s.sectionTitle}>Схема объекта</div>
            <div className={s.mapStage}>
              <img
                src={objectItem.mapImageUrl}
                alt={objectItem.name || objectItem.id}
                className={s.mapImage}
              />
            </div>
          </div>
        ) : (
          <div className={s.emptyBox}>Пока не задано изображение схемы объекта.</div>
        )}

        <div style={constructionSectionStyle}>
          <div style={sectionTitleStyle}>Карта конструкций</div>

          <div style={legendBlockStyle}>
            <div style={legendTitleStyle}>Маркировки карты конструкций</div>

            <div style={legendListStyle}>
              <div style={fixedLegendCardStyle}>
                <span style={legendColorBox("#94a3b8")} />
                <span>Не начато</span>
              </div>

              {constructionCategories.map((item) => (
                <div key={item.id} style={fixedLegendCardStyle}>
                  <span style={legendColorBox(item.color || "#94a3b8")} />
                  <span>{item.name || "-"}</span>
                </div>
              ))}

              <div style={fixedLegendCardStyle}>
                <span style={legendColorBox("#22c55e")} />
                <span>Готово</span>
              </div>
            </div>

            {canEdit ? (
              <div style={categoryEditorWrapStyle}>
                <div style={editorTitleStyle}>Редактирование маркировок</div>

                {constructionCategories.map((item) => (
                  <div key={item.id} style={categoryRowStyle}>
                    <input
                      value={item.name || ""}
                      onChange={(e) =>
                        updateCategoryLocal(item.id, { name: e.target.value })
                      }
                      style={categoryNameInputStyle}
                      placeholder="Название категории"
                    />

                    <input
                      type="color"
                      value={item.color || "#94a3b8"}
                      onChange={(e) =>
                        updateCategoryLocal(item.id, { color: e.target.value })
                      }
                      style={categoryColorInputStyle}
                    />

                    <button
                      type="button"
                      className={s.smallBtn}
                      onClick={() => handleSaveCategory(item)}
                      disabled={savingCategoryId === item.id}
                    >
                      {savingCategoryId === item.id ? "..." : "Сохранить"}
                    </button>

                    {String(item.type || "") === "custom" ? (
                      <button
                        type="button"
                        className={s.smallDangerBtn}
                        onClick={() => handleDeleteCategory(item)}
                        disabled={savingCategoryId === item.id}
                      >
                        Удалить
                      </button>
                    ) : (
                      <span style={baseCategoryTagStyle}>Базовая</span>
                    )}
                  </div>
                ))}

                <div style={newCategoryBoxStyle}>
                  <div style={editorTitleStyle}>Добавить новую категорию</div>

                  <div style={categoryRowStyle}>
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      style={categoryNameInputStyle}
                      placeholder="Например: Проверка, Доработка, Ожидание"
                    />

                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      style={categoryColorInputStyle}
                    />

                    <button
                      type="button"
                      className={s.primaryBtn}
                      onClick={handleCreateCategory}
                      disabled={creatingCategory}
                    >
                      {creatingCategory ? "Добавление..." : "Добавить"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {constructionNumbers.length === 0 ? (
            <div style={{ opacity: 0.75, marginTop: 14 }}>
              Для этого объекта ещё не задан диапазон конструкций.
            </div>
          ) : (
            <>
              <div style={constructionGridStyle}>
                {constructionNumbers.map((num) => {
                  const current = constructionStatesMap.get(num);
                  const visual = getCardVisual(current, constructionCategories);
                  const active = String(selectedConstructionNumber) === String(num);

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSelectConstruction(num)}
                      style={{
                        ...constructionCardStyle,
                        background: visual.background,
                        border: `1px solid ${active ? visual.accent : visual.border}`,
                        boxShadow: active
                          ? `0 0 0 2px ${visual.accent}33`
                          : "none",
                      }}
                    >
                      <div style={constructionNumberStyle}>{num}</div>
                      <div style={constructionShortStatusStyle}>{visual.label}</div>
                    </button>
                  );
                })}
              </div>

              <div style={constructionEditorStyle}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>
                  {selectedConstructionNumber
                    ? `Выбрана конструкция № ${selectedConstructionNumber}`
                    : "Выбери конструкцию"}
                </div>

                <div style={editorGridStyle}>
                  <div>
                    <label style={miniLabelStyle}>Статус конструкции</label>
                    <select
                      value={frameStatus}
                      onChange={(e) => setFrameStatus(e.target.value)}
                      disabled={!canEdit || !selectedConstructionNumber}
                      style={editorInputStyle}
                    >
                      <option value="not_started">Не начато</option>
                      <option value="built_not_wrapped">
                        {getCategoryByCode(constructionCategories, "frame_built_not_wrapped")
                          ?.name || "Конструкция собрана, не обтянута"}
                      </option>
                      <option value="built">
                        {getCategoryByCode(constructionCategories, "frame_built")?.name ||
                          "Конструкция собрана"}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label style={miniLabelStyle}>Статус панелей</label>
                    <select
                      value={panelStatus}
                      onChange={(e) => setPanelStatus(e.target.value)}
                      disabled={!canEdit || !selectedConstructionNumber}
                      style={editorInputStyle}
                    >
                      <option value="not_started">Не начато</option>
                      <option value="installed_not_wrapped">
                        {getCategoryByCode(
                          constructionCategories,
                          "panel_installed_not_wrapped"
                        )?.name || "Панели установлены, не обтянуты"}
                      </option>
                      <option value="wrapped">
                        {getCategoryByCode(constructionCategories, "panel_wrapped")?.name ||
                          "Панели обтянуты"}
                      </option>
                    </select>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: selectedConstructionVisual.background,
                      border: `1px solid ${selectedConstructionVisual.border}`,
                      color: selectedConstructionVisual.accent,
                      fontWeight: 800,
                      minHeight: 46,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Итог: {selectedConstructionVisual.label}
                  </div>
                </div>

                {customCategories.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={miniLabelStyle}>Дополнительные категории</div>

                    <div style={customCategoryWrapStyle}>
                      {customCategories.map((item) => (
                        <label key={item.id} style={customCategoryItemStyle}>
                          <input
                            type="checkbox"
                            checked={selectedCustomCategoryIds.includes(item.id)}
                            onChange={() => toggleCustomCategory(item.id)}
                            disabled={!canEdit || !selectedConstructionNumber}
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

                {canEdit ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    <button
                      type="button"
                      className={s.primaryBtn}
                      onClick={handleSaveConstruction}
                      disabled={savingConstruction || !selectedConstructionNumber}
                    >
                      {savingConstruction ? "Сохранение..." : "Сохранить"}
                    </button>

                    <button
                      type="button"
                      className={s.secondaryBtn}
                      onClick={handleResetConstruction}
                      disabled={savingConstruction || !selectedConstructionNumber}
                    >
                      Сбросить
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, opacity: 0.75 }}>
                    Работник пока видит карту конструкций только для просмотра.
                  </div>
                )}
              </div>
            </>
          )}
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

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
};

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

const legendBlockStyle = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(248,250,252,0.92)",
  border: "1px solid rgba(15,23,42,0.08)",
  marginBottom: 16,
};

const legendTitleStyle = {
  fontSize: 16,
  fontWeight: 900,
  marginBottom: 10,
};

const legendListStyle = {
  display: "grid",
  gap: 10,
};

const fixedLegendCardStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 15,
  fontWeight: 700,
  maxWidth: 460,
};

function legendColorBox(color) {
  return {
    width: 18,
    height: 18,
    borderRadius: 5,
    background: hexToSoft(color),
    border: `1px solid ${hexToBorder(color).replace("0.45", "0.65")}`,
    display: "inline-block",
    flexShrink: 0,
  };
}

const categoryEditorWrapStyle = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid rgba(15,23,42,0.08)",
  display: "grid",
  gap: 10,
};

const editorTitleStyle = {
  fontSize: 14,
  fontWeight: 900,
};

const categoryRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const categoryNameInputStyle = {
  flex: "1 1 260px",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
  padding: "0 12px",
  outline: "none",
};

const categoryColorInputStyle = {
  width: 52,
  height: 44,
  padding: 4,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
};

const baseCategoryTagStyle = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 700,
};

const newCategoryBoxStyle = {
  marginTop: 8,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const constructionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: 12,
};

const constructionCardStyle = {
  minHeight: 112,
  borderRadius: 16,
  padding: 14,
  textAlign: "left",
  cursor: "pointer",
};

const constructionNumberStyle = {
  fontSize: 26,
  fontWeight: 900,
  marginBottom: 16,
};

const constructionShortStatusStyle = {
  fontSize: 16,
  fontWeight: 700,
};

const constructionEditorStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const editorGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
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
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.18)",
  background: "#fff",
  padding: "0 12px",
  outline: "none",
};

const customCategoryWrapStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const customCategoryItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 13,
};
