import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebaseClient";

const MapPicker = dynamic(() => import("../../components/MapPicker"), {
  ssr: false,
});

const DEFAULT_LAT = 60.1699;
const DEFAULT_LNG = 24.9384;
const DEFAULT_RADIUS = 200;
const DEFAULT_ROOF_FIELDS_COUNT = 4;

function normalizeObjectKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яё\-]/gi, "");
}

function createRoofFields(count, current = []) {
  return Array.from({ length: count }, (_, index) => {
    const oldField = current[index];

    return {
      number: oldField?.number || `ST${index + 1}`,
      panels: Number.isFinite(Number(oldField?.panels))
        ? Number(oldField.panels)
        : 0,
    };
  });
}

function statusLabel(status) {
  if (status === "active") return "Активный";
  if (status === "inactive") return "Неактивный";
  if (status === "rework") return "Доработка";
  return status || "—";
}

function workTypeLabel(workType) {
  return workType === "roof" ? "Крыша" : "Поле";
}

function workerDisplayName(worker) {
  const fullName = [worker.firstName, worker.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    worker.fullName ||
    worker.name ||
    fullName ||
    worker.email ||
    worker.personalNumber ||
    worker.id
  );
}

export default function ManagerObjectsPage() {
  const router = useRouter();

  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");

  const [objects, setObjects] = useState([]);
  const [workers, setWorkers] = useState([]);

  const [editingId, setEditingId] = useState("");
  const [objectName, setObjectName] = useState("");
  const [objectStatus, setObjectStatus] = useState("active");
  const [workType, setWorkType] = useState("field");
  const [selectedWorkers, setSelectedWorkers] = useState([]);

  const [constructionStartNumber, setConstructionStartNumber] = useState(1);
  const [constructionEndNumber, setConstructionEndNumber] = useState(1);
  const [panelsPerConstruction, setPanelsPerConstruction] = useState(1);

  const [roofFieldsCount, setRoofFieldsCount] = useState(
    DEFAULT_ROOF_FIELDS_COUNT
  );

  const [roofFields, setRoofFields] = useState(() =>
    createRoofFields(DEFAULT_ROOF_FIELDS_COUNT)
  );

  const [showMap, setShowMap] = useState(false);
  const [mapLat, setMapLat] = useState(DEFAULT_LAT);
  const [mapLng, setMapLng] = useState(DEFAULT_LNG);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS);

  const fieldConstructionsTotal = useMemo(() => {
    const start = Number(constructionStartNumber);
    const end = Number(constructionEndNumber);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return 0;
    }

    return end - start + 1;
  }, [constructionStartNumber, constructionEndNumber]);

  const fieldPanelsTotal = useMemo(() => {
    const panels = Number(panelsPerConstruction);

    if (!Number.isFinite(panels) || panels < 0) {
      return 0;
    }

    return fieldConstructionsTotal * panels;
  }, [fieldConstructionsTotal, panelsPerConstruction]);

  const roofPanelsTotal = useMemo(() => {
    return roofFields.reduce((sum, field) => {
      const panels = Number(field.panels);

      return sum + (Number.isFinite(panels) && panels > 0 ? panels : 0);
    }, 0);
  }, [roofFields]);

  async function loadObjects() {
    const snapshot = await getDocs(collection(db, "Objects"));

    const rows = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    rows.sort((a, b) =>
      String(a.name || a.id).localeCompare(String(b.name || b.id), "ru")
    );

    setObjects(rows);
  }

  async function loadWorkers() {
    const snapshot = await getDocs(collection(db, "Users"));

    const rows = snapshot.docs
      .map((item) => ({
        id: item.id,
        ...item.data(),
      }))
      .filter((item) => item.role === "worker")
      .sort((a, b) =>
        workerDisplayName(a).localeCompare(workerDisplayName(b), "ru")
      );

    setWorkers(rows);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.replace("/login");
          return;
        }

        const userSnapshot = await getDoc(doc(db, "Users", user.uid));

        if (!userSnapshot.exists()) {
          router.replace("/login");
          return;
        }

        const userData = userSnapshot.data();

        const allowedRole =
          userData.role === "admin" || userData.role === "director";

        if (userData.status !== "active" || !allowedRole) {
          router.replace("/dashboard");
          return;
        }

        setAccessReady(true);

        await Promise.all([loadObjects(), loadWorkers()]);
      } catch (error) {
        console.error(error);
        setMessage("Не удалось загрузить данные страницы.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  function resetForm() {
    setEditingId("");
    setObjectName("");
    setObjectStatus("active");
    setWorkType("field");
    setSelectedWorkers([]);

    setConstructionStartNumber(1);
    setConstructionEndNumber(1);
    setPanelsPerConstruction(1);

    setRoofFieldsCount(DEFAULT_ROOF_FIELDS_COUNT);
    setRoofFields(createRoofFields(DEFAULT_ROOF_FIELDS_COUNT));

    setShowMap(false);
    setMapLat(DEFAULT_LAT);
    setMapLng(DEFAULT_LNG);
    setRadiusMeters(DEFAULT_RADIUS);
    setMessage("");
  }

  function handleRoofFieldsCountChange(value) {
    const nextCount = Math.max(1, Math.min(30, Number(value) || 1));

    setRoofFieldsCount(nextCount);

    setRoofFields((current) =>
      createRoofFields(nextCount, current)
    );
  }

  function updateRoofField(index, key, value) {
    setRoofFields((current) =>
      current.map((field, fieldIndex) => {
        if (fieldIndex !== index) {
          return field;
        }

        return {
          ...field,
          [key]:
            key === "panels"
              ? Math.max(0, Number(value) || 0)
              : value,
        };
      })
    );
  }

  function toggleWorker(uid) {
    setSelectedWorkers((current) =>
      current.includes(uid)
        ? current.filter((item) => item !== uid)
        : [...current, uid]
    );
  }

  function validateForm() {
    if (!objectName.trim()) {
      return "Укажи название объекта.";
    }

    if (
      !Number.isFinite(Number(mapLat)) ||
      !Number.isFinite(Number(mapLng))
    ) {
      return "Укажи точку объекта на карте.";
    }

    if (
      !Number.isFinite(Number(radiusMeters)) ||
      Number(radiusMeters) <= 0
    ) {
      return "Радиус объекта должен быть больше нуля.";
    }

    if (workType === "field") {
      const start = Number(constructionStartNumber);
      const end = Number(constructionEndNumber);
      const panels = Number(panelsPerConstruction);

      if (!Number.isInteger(start) || start < 1) {
        return "Начальный номер конструкции должен быть целым числом больше нуля.";
      }

      if (!Number.isInteger(end) || end < start) {
        return "Конечный номер конструкции не может быть меньше начального.";
      }

      if (!Number.isInteger(panels) || panels < 1) {
        return "Количество панелей на конструкции должно быть больше нуля.";
      }
    }

    if (workType === "roof") {
      if (roofFields.length < 1) {
        return "Добавь хотя бы одно поле крыши.";
      }

      const emptyNumber = roofFields.some(
        (field) => !String(field.number).trim()
      );

      if (emptyNumber) {
        return "У каждого поля крыши должен быть номер или название.";
      }

      const invalidPanels = roofFields.some((field) => {
        const panels = Number(field.panels);

        return !Number.isInteger(panels) || panels < 1;
      });

      if (invalidPanels) {
        return "Для каждого поля крыши укажи количество панелей больше нуля.";
      }
    }

    return "";
  }

  async function handleSave(event) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const objectKey =
        editingId || normalizeObjectKey(objectName);

      if (!objectKey) {
        throw new Error("Не удалось создать ключ объекта.");
      }

      const objectRef = doc(db, "Objects", objectKey);

      if (!editingId) {
        const existingSnapshot = await getDoc(objectRef);

        if (existingSnapshot.exists()) {
          throw new Error(
            "Объект с таким названием уже существует. Измени название объекта."
          );
        }
      }

      const isField = workType === "field";

      const planConstructions = isField
        ? fieldConstructionsTotal
        : 0;

      const planPanels = isField
        ? fieldPanelsTotal
        : roofPanelsTotal;

      const payload = {
        name: objectName.trim(),
        status: objectStatus,
        workType,

        visibleToWorkerUids:
          objectStatus === "rework"
            ? selectedWorkers
            : [],

        geo: {
          lat: Number(mapLat),
          lng: Number(mapLng),
          radiusMeters: Number(radiusMeters),
        },

        constructionStartNumber: isField
          ? Number(constructionStartNumber)
          : null,

        constructionEndNumber: isField
          ? Number(constructionEndNumber)
          : null,

        panelsPerConstruction: isField
          ? Number(panelsPerConstruction)
          : null,

        roofFieldCount: isField
          ? 0
          : roofFields.length,

        roofFields: isField
          ? []
          : roofFields.map((field, index) => ({
              index: index + 1,
              number: String(field.number).trim(),
              panels: Number(field.panels),
            })),

        mapPlanConstructions: planConstructions,
        mapPlanPanels: planPanels,
        updatedAt: serverTimestamp(),
      };

      const successMessage = editingId
        ? "Изменения объекта сохранены."
        : "Объект создан.";

      if (editingId) {
        await updateDoc(objectRef, payload);
      } else {
        await setDoc(objectRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await loadObjects();

      resetForm();
      setMessage(successMessage);
    } catch (error) {
      console.error(error);

      setMessage(
        error.message || "Не удалось сохранить объект."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(item) {
    const nextWorkType =
      item.workType === "roof"
        ? "roof"
        : "field";

    const savedRoofFields = Array.isArray(item.roofFields)
      ? item.roofFields
      : [];

    const savedRoofCount =
      Number(item.roofFieldCount) ||
      savedRoofFields.length ||
      DEFAULT_ROOF_FIELDS_COUNT;

    setEditingId(item.id);
    setObjectName(item.name || "");
    setObjectStatus(item.status || "active");
    setWorkType(nextWorkType);

    setSelectedWorkers(
      Array.isArray(item.visibleToWorkerUids)
        ? item.visibleToWorkerUids
        : []
    );

    setConstructionStartNumber(
      Number(item.constructionStartNumber) || 1
    );

    setConstructionEndNumber(
      Number(item.constructionEndNumber) || 1
    );

    setPanelsPerConstruction(
      Number(item.panelsPerConstruction) || 1
    );

    setRoofFieldsCount(savedRoofCount);

    setRoofFields(
      createRoofFields(
        savedRoofCount,
        savedRoofFields
      )
    );

    setMapLat(
      Number(item.geo?.lat) || DEFAULT_LAT
    );

    setMapLng(
      Number(item.geo?.lng) || DEFAULT_LNG
    );

    setRadiusMeters(
      Number(item.geo?.radiusMeters) || DEFAULT_RADIUS
    );

    setShowMap(false);
    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      `Удалить объект «${
        item.name || item.id
      }» вместе со всеми связанными данными?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setMessage("");

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error(
          "Пользователь не авторизован."
        );
      }

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/objects/delete",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            objectId: item.id,
            id: item.id,
          }),
        }
      );

      let responseData = null;

      try {
        responseData = await response.json();
      } catch {
        responseData = null;
      }

      if (!response.ok) {
        throw new Error(
          responseData?.error ||
            responseData?.message ||
            "Ошибка удаления объекта."
        );
      }

      if (editingId === item.id) {
        resetForm();
      }

      await loadObjects();

      setMessage("Объект удалён.");
    } catch (error) {
      console.error(error);

      setMessage(
        error.message ||
          "Не удалось удалить объект."
      );
    } finally {
      setDeletingId("");
    }
  }

  if (loading || !accessReady) {
    return (
      <main className="loadingPage">
        <div className="loadingCard">
          Загрузка объектов…
        </div>

        <style jsx>{`
          .loadingPage {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
          }

          .loadingCard {
            padding: 18px 22px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.94);
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
            font-weight: 700;
          }
        `}</style>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>
          Управление объектами | Solar E-Tron
        </title>
      </Head>

      <main className="page">
        <div className="content">
          <div className="topBar">
            <div>
              <p className="eyebrow">
                Solar E-Tron
              </p>

              <h1>
                Управление объектами
              </h1>
            </div>

            <Link
              href="/manager"
              className="backButton"
            >
              Назад в кабинет
            </Link>
          </div>

          <form
            className="card formCard"
            onSubmit={handleSave}
          >
            <div className="cardHeader">
              <div>
                <h2>
                  {editingId
                    ? "Редактирование объекта"
                    : "Новый объект"}
                </h2>

                <p>
                  Для поля используются конструкции.
                  Для крыши — отдельные поля с
                  индивидуальным количеством панелей.
                </p>
              </div>

              {editingId && (
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={resetForm}
                >
                  Отменить редактирование
                </button>
              )}
            </div>

            <div className="formGrid twoColumns">
              <label className="fieldGroup">
                <span>
                  Название объекта
                </span>

                <input
                  value={objectName}
                  onChange={(event) =>
                    setObjectName(
                      event.target.value
                    )
                  }
                  placeholder="Например: Pori 1"
                />
              </label>

              <label className="fieldGroup">
                <span>
                  Статус
                </span>

                <select
                  value={objectStatus}
                  onChange={(event) =>
                    setObjectStatus(
                      event.target.value
                    )
                  }
                >
                  <option value="active">
                    Активный
                  </option>

                  <option value="inactive">
                    Неактивный
                  </option>

                  <option value="rework">
                    Доработка
                  </option>
                </select>
              </label>
            </div>

            <div className="sectionBlock workChoiceBlock">
              <div className="sectionTitleRow">
                <div>
                  <h3>
                    Выбор работы
                  </h3>

                  <p>
                    Выбери тип объекта: поле
                    или крыша.
                  </p>
                </div>
              </div>

              <div className="choiceGrid">
                <button
                  type="button"
                  className={`choiceButton ${
                    workType === "field"
                      ? "choiceButtonActive"
                      : ""
                  }`}
                  onClick={() =>
                    setWorkType("field")
                  }
                >
                  <strong>
                    Поле
                  </strong>

                  <span>
                    Конструкции и панели
                    на конструкциях
                  </span>
                </button>

                <button
                  type="button"
                  className={`choiceButton ${
                    workType === "roof"
                      ? "choiceButtonActive"
                      : ""
                  }`}
                  onClick={() =>
                    setWorkType("roof")
                  }
                >
                  <strong>
                    Крыша
                  </strong>

                  <span>
                    Поля крыши с разным
                    количеством панелей
                  </span>
                </button>
              </div>
            </div>

            {workType === "field" ? (
              <div className="sectionBlock fieldSettingsBlock">
                <div className="sectionTitleRow">
                  <div>
                    <h3>
                      Настройки карты конструкций
                    </h3>

                    <p>
                      Система рассчитает общее
                      количество конструкций и панелей.
                    </p>
                  </div>
                </div>

                <div className="formGrid threeColumns">
                  <label className="fieldGroup">
                    <span>
                      Начальный номер конструкции
                    </span>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={constructionStartNumber}
                      onChange={(event) =>
                        setConstructionStartNumber(
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="fieldGroup">
                    <span>
                      Конечный номер конструкции
                    </span>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={constructionEndNumber}
                      onChange={(event) =>
                        setConstructionEndNumber(
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="fieldGroup">
                    <span>
                      Панелей на конструкции
                    </span>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={panelsPerConstruction}
                      onChange={(event) =>
                        setPanelsPerConstruction(
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                <div className="summaryGrid">
                  <div className="summaryItem">
                    <span>
                      Всего конструкций
                    </span>

                    <strong>
                      {fieldConstructionsTotal}
                    </strong>
                  </div>

                  <div className="summaryItem">
                    <span>
                      Всего панелей
                    </span>

                    <strong>
                      {fieldPanelsTotal}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="sectionBlock roofSettingsBlock">
                <div className="sectionTitleRow">
                  <div>
                    <h3>
                      Настройки крыши
                    </h3>

                    <p>
                      Укажи количество полей крыши,
                      номер каждого поля и число
                      панелей на нём.
                    </p>
                  </div>
                </div>

                <label className="fieldGroup countField">
                  <span>
                    Количество полей на крыше
                  </span>

                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    value={roofFieldsCount}
                    onChange={(event) =>
                      handleRoofFieldsCountChange(
                        event.target.value
                      )
                    }
                  />
                </label>

                <div className="roofFieldsList">
                  {roofFields.map(
                    (field, index) => (
                      <div
                        className="roofFieldRow"
                        key={`roof-field-${index}`}
                      >
                        <div className="roofFieldIndex">
                          {index + 1}
                        </div>

                        <label className="fieldGroup">
                          <span>
                            Номер или название поля
                          </span>

                          <input
                            value={field.number}
                            onChange={(event) =>
                              updateRoofField(
                                index,
                                "number",
                                event.target.value
                              )
                            }
                            placeholder={`ST${index + 1}`}
                          />
                        </label>

                        <label className="fieldGroup">
                          <span>
                            Количество панелей
                          </span>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={field.panels}
                            onChange={(event) =>
                              updateRoofField(
                                index,
                                "panels",
                                event.target.value
                              )
                            }
                          />
                        </label>
                      </div>
                    )
                  )}
                </div>

                <div className="summaryGrid roofSummary">
                  <div className="summaryItem">
                    <span>
                      Всего полей
                    </span>

                    <strong>
                      {roofFields.length}
                    </strong>
                  </div>

                  <div className="summaryItem">
                    <span>
                      Всего панелей
                    </span>

                    <strong>
                      {roofPanelsTotal}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="sectionBlock mapBlock">
              <div className="sectionTitleRow">
                <div>
                  <h3>
                    Расположение объекта
                  </h3>

                  <p>
                    Точка и радиус используются
                    для отметки рабочего времени.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setShowMap(
                      (current) => !current
                    )
                  }
                >
                  {showMap
                    ? "Скрыть карту"
                    : "Выбрать на карте"}
                </button>
              </div>

              <div className="locationInfo">
                <span>
                  Широта:{" "}
                  {Number(mapLat).toFixed(6)}
                </span>

                <span>
                  Долгота:{" "}
                  {Number(mapLng).toFixed(6)}
                </span>

                <span>
                  Радиус:{" "}
                  {Number(radiusMeters)} м
                </span>
              </div>

              {showMap && (
                <div className="mapWrapper">
                  <MapPicker
                    lat={mapLat}
                    lng={mapLng}
                    radiusMeters={radiusMeters}
                    onChange={(next) => {
                      setMapLat(next.lat);
                      setMapLng(next.lng);
                      setRadiusMeters(
                        next.radiusMeters
                      );
                    }}
                  />
                </div>
              )}
            </div>

            {objectStatus === "rework" && (
              <div className="sectionBlock workersBlock">
                <div className="sectionTitleRow">
                  <div>
                    <h3>
                      Работники для доработки
                    </h3>

                    <p>
                      Объект увидят только выбранные
                      работники. Директор и
                      администратор видят его всегда.
                    </p>
                  </div>
                </div>

                {workers.length === 0 ? (
                  <p className="emptyText">
                    Работники не найдены.
                  </p>
                ) : (
                  <div className="workersGrid">
                    {workers.map((worker) => (
                      <label
                        className="workerCheck"
                        key={worker.id}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWorkers.includes(
                            worker.id
                          )}
                          onChange={() =>
                            toggleWorker(worker.id)
                          }
                        />

                        <span>
                          {workerDisplayName(worker)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {message && (
              <div className="messageBox">
                {message}
              </div>
            )}

            <div className="formActions">
              <button
                type="submit"
                className="primaryButton"
                disabled={saving}
              >
                {saving
                  ? "Сохранение…"
                  : editingId
                  ? "Сохранить изменения"
                  : "Создать объект"}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>

          <section className="card listCard">
            <div className="cardHeader">
              <div>
                <h2>
                  Сохранённые объекты
                </h2>

                <p>
                  Всего объектов: {objects.length}
                </p>
              </div>
            </div>

            {objects.length === 0 ? (
              <p className="emptyText">
                Объекты пока не созданы.
              </p>
            ) : (
              <div className="objectsList">
                {objects.map((item) => {
                  const itemWorkType =
                    item.workType === "roof"
                      ? "roof"
                      : "field";

                  const itemConstructions =
                    Number(
                      item.mapPlanConstructions
                    ) || 0;

                  const itemPanels =
                    Number(
                      item.mapPlanPanels
                    ) || 0;

                  const itemRoofFields =
                    Number(item.roofFieldCount) ||
                    (Array.isArray(item.roofFields)
                      ? item.roofFields.length
                      : 0);

                  return (
                    <article
                      className={`objectRow ${
                        editingId === item.id
                          ? "objectRowActive"
                          : ""
                      }`}
                      key={item.id}
                    >
                      <div className="objectMain">
                        <div className="objectTitleRow">
                          <h3>
                            {item.name || item.id}
                          </h3>

                          <span
                            className={`typeBadge typeBadge-${itemWorkType}`}
                          >
                            {workTypeLabel(
                              itemWorkType
                            )}
                          </span>

                          <span
                            className={`statusBadge status-${item.status}`}
                          >
                            {statusLabel(
                              item.status
                            )}
                          </span>
                        </div>

                        <p className="objectKey">
                          Ключ: {item.id}
                        </p>

                        <div className="objectStats">
                          {itemWorkType === "field" ? (
                            <>
                              <span>
                                Конструкций:{" "}
                                {itemConstructions}
                              </span>

                              <span>
                                Панелей:{" "}
                                {itemPanels}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>
                                Полей крыши:{" "}
                                {itemRoofFields}
                              </span>

                              <span>
                                Панелей:{" "}
                                {itemPanels}
                              </span>
                            </>
                          )}

                          <span>
                            Радиус:{" "}
                            {Number(
                              item.geo?.radiusMeters
                            ) || 0}{" "}
                            м
                          </span>

                          {item.status === "rework" && (
                            <span>
                              Работников:{" "}
                              {item
                                .visibleToWorkerUids
                                ?.length || 0}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="objectActions">
                        {itemWorkType === "field" ? (
                          <Link
                            href={`/object-map/${item.id}`}
                            className="secondaryButton linkButton"
                          >
                            Открыть карту конструкций
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="secondaryButton"
                            disabled
                            title="Рабочую карту крыши добавим следующим этапом"
                          >
                            Карта крыши — следующий этап
                          </button>
                        )}

                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() =>
                            handleEdit(item)
                          }
                        >
                          Редактировать
                        </button>

                        <button
                          type="button"
                          className="dangerButton"
                          onClick={() =>
                            handleDelete(item)
                          }
                          disabled={
                            deletingId === item.id
                          }
                        >
                          {deletingId === item.id
                            ? "Удаление…"
                            : "Удалить"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 28px 16px 56px;
        }

        .content {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .topBar,
        .cardHeader,
        .sectionTitleRow,
        .formActions,
        .objectTitleRow,
        .objectActions {
          display: flex;
          align-items: center;
        }

        .topBar {
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }

        .eyebrow {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8a6817;
        }

        h1,
        h2,
        h3,
        p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 0;
          font-size: clamp(28px, 4vw, 42px);
        }

        h2 {
          margin-bottom: 6px;
          font-size: 24px;
        }

        h3 {
          margin-bottom: 5px;
          font-size: 18px;
        }

        .card {
          border: 1px solid rgba(122, 92, 22, 0.2);
          border-radius: 22px;
          background: rgba(255, 251, 239, 0.96);
          box-shadow: 0 14px 38px
            rgba(52, 39, 11, 0.14);
        }

        .formCard {
          padding: 22px;
        }

        .listCard {
          margin-top: 22px;
          padding: 22px;
        }

        .cardHeader,
        .sectionTitleRow {
          justify-content: space-between;
          gap: 16px;
        }

        .cardHeader p,
        .sectionTitleRow p,
        .emptyText {
          margin-bottom: 0;
          color: #655f52;
        }

        .formGrid {
          display: grid;
          gap: 16px;
          margin-top: 20px;
        }

        .twoColumns {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
        }

        .threeColumns {
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
        }

        .fieldGroup {
          display: grid;
          gap: 7px;
        }

        .fieldGroup > span {
          font-size: 14px;
          font-weight: 800;
          color: #39342a;
        }

        input,
        select {
          width: 100%;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid #cabd9d;
          border-radius: 11px;
          background: #fff;
          color: #181713;
          font: inherit;
          outline: none;
        }

        input:focus,
        select:focus {
          border-color: #9a741d;
          box-shadow: 0 0 0 3px
            rgba(154, 116, 29, 0.14);
        }

        .sectionBlock {
          margin-top: 20px;
          padding: 18px;
          border: 1px solid
            rgba(122, 92, 22, 0.18);
          border-radius: 17px;
          background: rgba(255, 255, 255, 0.62);
        }

        .workChoiceBlock {
          background: rgba(255, 246, 216, 0.8);
        }

        .fieldSettingsBlock {
          background: rgba(235, 247, 235, 0.82);
        }

        .roofSettingsBlock {
          background: rgba(235, 243, 255, 0.86);
        }

        .choiceGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 15px;
        }

        .choiceButton {
          display: grid;
          gap: 5px;
          min-height: 88px;
          padding: 15px;
          text-align: left;
          border: 2px solid transparent;
          border-radius: 14px;
          background: #fff;
          color: #2b2923;
          cursor: pointer;
        }

        .choiceButton strong {
          font-size: 18px;
        }

        .choiceButton span {
          color: #69645a;
        }

        .choiceButtonActive {
          border-color: #a67b16;
          background: #fff9e8;
          box-shadow: 0 8px 20px
            rgba(122, 92, 22, 0.12);
        }

        .summaryGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 220px));
          gap: 12px;
          margin-top: 16px;
        }

        .summaryItem {
          display: grid;
          gap: 4px;
          padding: 13px 15px;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid
            rgba(0, 0, 0, 0.08);
        }

        .summaryItem span {
          color: #615c52;
          font-size: 13px;
        }

        .summaryItem strong {
          font-size: 25px;
        }

        .countField {
          width: min(320px, 100%);
          margin-top: 16px;
        }

        .roofFieldsList {
          display: grid;
          gap: 11px;
          margin-top: 16px;
        }

        .roofFieldRow {
          display: grid;
          grid-template-columns:
            42px
            minmax(0, 1fr)
            minmax(170px, 0.55fr);
          gap: 12px;
          align-items: end;
          padding: 13px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid
            rgba(70, 105, 150, 0.16);
        }

        .roofFieldIndex {
          display: grid;
          place-items: center;
          width: 38px;
          height: 44px;
          border-radius: 11px;
          background: #e2ecfb;
          font-weight: 900;
          color: #304d72;
        }

        .locationInfo,
        .objectStats {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .locationInfo {
          margin-top: 14px;
        }

        .locationInfo span,
        .objectStats span {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid
            rgba(0, 0, 0, 0.08);
          font-size: 13px;
        }

        .mapWrapper {
          margin-top: 15px;
          overflow: hidden;
          border-radius: 15px;
        }

        .workersGrid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(220px, 1fr)
            );
          gap: 10px;
          margin-top: 14px;
        }

        .workerCheck {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 12px;
          border-radius: 12px;
          background: #fff;
          border: 1px solid
            rgba(0, 0, 0, 0.09);
          cursor: pointer;
        }

        .workerCheck input {
          width: 18px;
          min-height: auto;
          height: 18px;
        }

        .messageBox {
          margin-top: 18px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #fff3c9;
          border: 1px solid #d8ba56;
          color: #4c3b08;
          font-weight: 700;
        }

        .formActions {
          gap: 11px;
          margin-top: 20px;
        }

        .primaryButton,
        .secondaryButton,
        .dangerButton,
        .backButton {
          display: inline-flex;
          justify-content: center;
          align-items: center;
          min-height: 42px;
          padding: 10px 15px;
          border-radius: 11px;
          font: inherit;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }

        .primaryButton {
          border: 1px solid #7e5d12;
          background: #9b7419;
          color: #fff;
        }

        .secondaryButton,
        .backButton {
          border: 1px solid #b8a77e;
          background: #fff;
          color: #332e23;
        }

        .dangerButton {
          border: 1px solid #a94646;
          background: #fff4f4;
          color: #8b2525;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .objectsList {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }

        .objectRow {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
          padding: 16px;
          border-radius: 15px;
          border: 1px solid
            rgba(122, 92, 22, 0.17);
          background: rgba(255, 255, 255, 0.84);
        }

        .objectRowActive {
          border-color: #a67b16;
          box-shadow: 0 0 0 3px
            rgba(166, 123, 22, 0.1);
        }

        .objectTitleRow {
          flex-wrap: wrap;
          gap: 8px;
        }

        .objectTitleRow h3 {
          margin-bottom: 0;
          margin-right: 2px;
        }

        .objectKey {
          margin: 6px 0 10px;
          font-size: 13px;
          color: #777065;
        }

        .typeBadge,
        .statusBadge {
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
        }

        .typeBadge-field {
          background: #e4f3e4;
          color: #285d2c;
        }

        .typeBadge-roof {
          background: #e5eefc;
          color: #294f7f;
        }

        .status-active {
          background: #dcf4df;
          color: #24632c;
        }

        .status-inactive {
          background: #eeeeee;
          color: #555;
        }

        .status-rework {
          background: #fff0c9;
          color: #75520b;
        }

        .objectActions {
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          max-width: 390px;
        }

        .linkButton {
          white-space: nowrap;
        }

        @media (max-width: 850px) {
          .threeColumns,
          .twoColumns,
          .choiceGrid {
            grid-template-columns: 1fr;
          }

          .objectRow {
            grid-template-columns: 1fr;
          }

          .objectActions {
            justify-content: flex-start;
            max-width: none;
          }
        }

        @media (max-width: 620px) {
          .page {
            padding: 16px 10px 40px;
          }

          .topBar,
          .cardHeader,
          .sectionTitleRow {
            align-items: stretch;
            flex-direction: column;
          }

          .formCard,
          .listCard {
            padding: 15px;
            border-radius: 17px;
          }

          .sectionBlock {
            padding: 14px;
          }

          .roofFieldRow {
            grid-template-columns:
              38px minmax(0, 1fr);
          }

          .roofFieldRow
            .fieldGroup:last-child {
            grid-column: 2;
          }

          .summaryGrid {
            grid-template-columns: 1fr 1fr;
          }

          .formActions,
          .objectActions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .primaryButton,
          .secondaryButton,
          .dangerButton,
          .backButton {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
