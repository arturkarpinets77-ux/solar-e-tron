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
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

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

export default function ObjectMapPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [objectItem, setObjectItem] = useState(null);
  const [markers, setMarkers] = useState([]);

  const [imageUrlInput, setImageUrlInput] = useState("");
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

  const canEdit = useMemo(() => {
    const role = String(profile?.role || "").toLowerCase();
    return role === "director" || role === "admin";
  }, [profile]);

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
          return;
        }

        const obj = { id: objectSnap.id, ...objectSnap.data() };

        if (role === "worker" && !visibleForWorker(obj, user.uid)) {
          setMsg("У тебя нет доступа к карте этого объекта.");
          setObjectItem(null);
          setMarkers([]);
          return;
        }

        setObjectItem(obj);
        setImageUrlInput(String(obj.mapImageUrl || ""));
        setPlanPanelsInput(String(obj.mapPlanPanels || ""));
        setPlanConstructionsInput(String(obj.mapPlanConstructions || ""));

        await loadMarkers(String(id));
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
      setMsg("Сначала кликни по схеме, чтобы выбрать место маркировки.");
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

  const installedPanels = useMemo(() => {
    return markers.reduce((sum, item) => sum + Number(item.panelsCount || 0), 0);
  }, [markers]);

  const installedConstructions = useMemo(() => {
    return markers.reduce((sum, item) => sum + Number(item.constructionsCount || 0), 0);
  }, [markers]);

  const planPanels = Number(objectItem?.mapPlanPanels || 0);
  const planConstructions = Number(objectItem?.mapPlanConstructions || 0);

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

        <div className={s.statsGrid}>
          <div className={s.statBox}>
            <div className={s.statLabel}>План панелей</div>
            <div className={s.statValue}>{planPanels}</div>
          </div>
          <div className={s.statBox}>
            <div className={s.statLabel}>Установлено панелей</div>
            <div className={s.statValue}>{installedPanels}</div>
          </div>
          <div className={s.statBox}>
            <div className={s.statLabel}>План конструкций</div>
            <div className={s.statValue}>{planConstructions}</div>
          </div>
          <div className={s.statBox}>
            <div className={s.statLabel}>Собрано конструкций</div>
            <div className={s.statValue}>{installedConstructions}</div>
          </div>
        </div>

        {canEdit ? (
          <div className={s.settingsBox}>
            <div className={s.sectionTitle}>Настройки карты объекта</div>

            <label className={s.label}>URL изображения схемы объекта</label>
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
              <button className={s.primaryBtn} type="button" onClick={handleSaveMapSettings}>
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
          <div className={s.emptyBox}>
            Пока не задано изображение схемы объекта.
          </div>
        )}

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

        {msg ? <div className={s.msg}>{msg}</div> : null}

        <div className={s.footerLinks}>
          {String(profile?.role || "").toLowerCase() === "worker" ? (
            <Link href={`/worker/object/${encodeURIComponent(objectItem.id)}`}>← К объекту</Link>
          ) : (
            <Link href="/manager/objects">← К объектам</Link>
          )}
        </div>
      </div>
    </main>
  );
}
