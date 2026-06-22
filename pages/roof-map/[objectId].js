import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import {
  auth,
  db,
  storage,
} from "../../lib/firebaseClient";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_FILE_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
]);

function visibleForWorker(objectItem, uid) {
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
      ? objectItem.visibleToWorkerUids.includes(uid)
      : false;
  }

  return false;
}

function normalizeRoofFields(objectData) {
  if (!Array.isArray(objectData?.roofFields)) {
    return [];
  }

  return objectData.roofFields.map(
    (field, index) => ({
      index,
      number: String(
        field?.number || `ST${index + 1}`
      ),
      panels: Math.max(
        0,
        Math.trunc(
          Number(field?.panels) || 0
        )
      ),
    })
  );
}

function clampInteger(
  value,
  minimum,
  maximum
) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return minimum;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(numericValue)
    )
  );
}

function roleLabel(role) {
  if (role === "worker") {
    return "Работник";
  }

  if (role === "director") {
    return "Директор";
  }

  if (role === "admin") {
    return "Администратор";
  }

  return role || "—";
}

function fileExtension(fileName) {
  const parts = String(fileName || "")
    .toLowerCase()
    .split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.pop();
}

function sanitizeFileName(fileName) {
  const originalName = String(
    fileName || "file"
  );

  const extension = fileExtension(
    originalName
  );

  const nameWithoutExtension = extension
    ? originalName.slice(
        0,
        -(extension.length + 1)
      )
    : originalName;

  const safeBase =
    nameWithoutExtension
      .trim()
      .replace(
        /[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g,
        "-"
      )
      .replace(/-+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .slice(0, 100) || "file";

  return extension
    ? `${safeBase}.${extension}`
    : safeBase;
}

function formatFileSize(size) {
  const bytes = Number(size) || 0;

  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(
      bytes / 1024
    )} КБ`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} МБ`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "—";
  }

  try {
    const date =
      typeof timestamp.toDate ===
      "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    return date.toLocaleString("fi-FI");
  } catch {
    return "—";
  }
}

function isImageDocument(documentItem) {
  return String(
    documentItem?.contentType || ""
  ).startsWith("image/");
}

function documentTypeLabel(documentItem) {
  const extension = fileExtension(
    documentItem?.fileName
  );

  if (extension) {
    return extension.toUpperCase();
  }

  return "ФАЙЛ";
}

export default function RoofMapPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [loading, setLoading] =
    useState(true);

  const [pageError, setPageError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [currentUser, setCurrentUser] =
    useState(null);

  const [currentRole, setCurrentRole] =
    useState("");

  const [objectItem, setObjectItem] =
    useState(null);

  const [roofFields, setRoofFields] =
    useState([]);

  const [
    progressByIndex,
    setProgressByIndex,
  ] = useState({});

  const [draftByIndex, setDraftByIndex] =
    useState({});

  const [savingIndex, setSavingIndex] =
    useState(null);

  const [roofDocuments, setRoofDocuments] =
    useState([]);

  const [selectedFiles, setSelectedFiles] =
    useState([]);

  const [uploadingFiles, setUploadingFiles] =
    useState(false);

  const [
    deletingDocumentId,
    setDeletingDocumentId,
  ] = useState("");

  useEffect(() => {
    if (!router.isReady || !auth || !db) {
      return;
    }

    const routeValue =
      router.query.objectId;

    const objectId = decodeURIComponent(
      String(
        Array.isArray(routeValue)
          ? routeValue[0]
          : routeValue || ""
      ).trim()
    );

    if (!objectId) {
      setLoading(false);
      setPageError(
        "Не указан идентификатор объекта."
      );
      return;
    }

    let unsubscribeProgress = null;
    let unsubscribeDocuments = null;

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        async (user) => {
          setLoading(true);
          setPageError("");
          setMessage("");

          if (unsubscribeProgress) {
            unsubscribeProgress();
            unsubscribeProgress = null;
          }

          if (unsubscribeDocuments) {
            unsubscribeDocuments();
            unsubscribeDocuments = null;
          }

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

            const allowedRole =
              role === "worker" ||
              role === "director" ||
              role === "admin";

            if (
              status !== "active" ||
              !allowedRole
            ) {
              router.replace(
                "/dashboard"
              );
              return;
            }

            setCurrentUser(user);
            setCurrentRole(role);

            const objectSnapshot =
              await getDoc(
                doc(
                  db,
                  "Objects",
                  objectId
                )
              );

            if (!objectSnapshot.exists()) {
              setPageError(
                "Объект не найден."
              );
              setLoading(false);
              return;
            }

            const objectData = {
              id: objectSnapshot.id,
              ...objectSnapshot.data(),
            };

            if (
              String(
                objectData.workType || ""
              ).toLowerCase() !== "roof"
            ) {
              setPageError(
                "Этот объект не относится к типу «Крыша»."
              );
              setLoading(false);
              return;
            }

            if (
              role === "worker" &&
              !visibleForWorker(
                objectData,
                user.uid
              )
            ) {
              setPageError(
                "У тебя нет доступа к этому объекту."
              );
              setLoading(false);
              return;
            }

            const fields =
              normalizeRoofFields(
                objectData
              );

            if (!fields.length) {
              setPageError(
                "В объекте не настроены поля крыши."
              );
              setLoading(false);
              return;
            }

            setObjectItem(objectData);
            setRoofFields(fields);

            unsubscribeProgress =
              onSnapshot(
                collection(
                  db,
                  "Objects",
                  objectId,
                  "RoofProgress"
                ),
                (snapshot) => {
                  const nextProgress = {};

                  snapshot.docs.forEach(
                    (
                      progressDocument
                    ) => {
                      const data =
                        progressDocument.data() ||
                        {};

                      const fieldIndex =
                        Number(
                          data.fieldIndex
                        );

                      if (
                        Number.isInteger(
                          fieldIndex
                        ) &&
                        fieldIndex >= 0
                      ) {
                        nextProgress[
                          fieldIndex
                        ] = {
                          id:
                            progressDocument.id,

                          fieldIndex,

                          installedPanels:
                            Math.max(
                              0,
                              Math.trunc(
                                Number(
                                  data.installedPanels
                                ) || 0
                              )
                            ),

                          updatedByUid:
                            String(
                              data.updatedByUid ||
                                ""
                            ),

                          updatedAt:
                            data.updatedAt ||
                            null,
                        };
                      }
                    }
                  );

                  setProgressByIndex(
                    nextProgress
                  );

                  setDraftByIndex(
                    (current) => {
                      const nextDraft = {
                        ...current,
                      };

                      fields.forEach(
                        (field) => {
                          nextDraft[
                            field.index
                          ] = String(
                            nextProgress[
                              field.index
                            ]
                              ?.installedPanels ||
                              0
                          );
                        }
                      );

                      return nextDraft;
                    }
                  );
                },
                (error) => {
                  console.error(
                    "Ошибка загрузки прогресса крыши:",
                    error
                  );

                  setPageError(
                    error?.message ||
                      "Не удалось загрузить прогресс крыши."
                  );
                }
              );

            unsubscribeDocuments =
              onSnapshot(
                collection(
                  db,
                  "Objects",
                  objectId,
                  "RoofDocuments"
                ),
                (snapshot) => {
                  const documents =
                    snapshot.docs.map(
                      (documentSnapshot) => ({
                        id:
                          documentSnapshot.id,
                        ...documentSnapshot.data(),
                      })
                    );

                  documents.sort(
                    (a, b) => {
                      const timeA =
                        a.uploadedAt
                          ?.seconds || 0;

                      const timeB =
                        b.uploadedAt
                          ?.seconds || 0;

                      return timeB - timeA;
                    }
                  );

                  setRoofDocuments(
                    documents
                  );
                },
                (error) => {
                  console.error(
                    "Ошибка загрузки документов крыши:",
                    error
                  );

                  setMessage(
                    error?.message ||
                      "Не удалось загрузить документы объекта."
                  );
                }
              );

            setLoading(false);
          } catch (error) {
            console.error(
              "Ошибка загрузки карты крыши:",
              error
            );

            setPageError(
              error?.message ||
                "Не удалось открыть карту крыши."
            );

            setLoading(false);
          }
        }
      );

    return () => {
      unsubscribeAuth();

      if (unsubscribeProgress) {
        unsubscribeProgress();
      }

      if (unsubscribeDocuments) {
        unsubscribeDocuments();
      }
    };
  }, [
    router.isReady,
    router.query.objectId,
  ]);

  const canManageDocuments =
    currentRole === "director" ||
    currentRole === "admin";

  const totalPlannedPanels =
    useMemo(() => {
      return roofFields.reduce(
        (sum, field) =>
          sum + field.panels,
        0
      );
    }, [roofFields]);

  const totalInstalledPanels =
    useMemo(() => {
      return roofFields.reduce(
        (sum, field) => {
          const installed =
            progressByIndex[
              field.index
            ]?.installedPanels || 0;

          return sum + installed;
        },
        0
      );
    }, [
      roofFields,
      progressByIndex,
    ]);

  const totalRemainingPanels =
    Math.max(
      totalPlannedPanels -
        totalInstalledPanels,
      0
    );

  const totalProgressPercent =
    totalPlannedPanels > 0
      ? Math.min(
          100,
          Math.round(
            (totalInstalledPanels /
              totalPlannedPanels) *
              100
          )
        )
      : 0;

  const backHref =
    currentRole === "worker"
      ? "/worker/objects"
      : "/manager/objects";

  function getDraftValue(fieldIndex) {
    const value =
      draftByIndex[fieldIndex];

    if (
      value === undefined ||
      value === null
    ) {
      return "0";
    }

    return String(value);
  }

  function updateDraft(
    fieldIndex,
    value
  ) {
    setDraftByIndex((current) => ({
      ...current,
      [fieldIndex]: value,
    }));

    setMessage("");
  }

  async function saveProgress(
    fieldIndex,
    selectedValue
  ) {
    if (!currentUser || !objectItem) {
      return;
    }

    const field = roofFields.find(
      (item) =>
        item.index === fieldIndex
    );

    if (!field) {
      setMessage(
        "Поле крыши не найдено."
      );
      return;
    }

    const installedPanels =
      clampInteger(
        selectedValue,
        0,
        field.panels
      );

    setSavingIndex(fieldIndex);
    setMessage("");

    try {
      const progressDocumentId =
        `field-${fieldIndex + 1}`;

      await setDoc(
        doc(
          db,
          "Objects",
          objectItem.id,
          "RoofProgress",
          progressDocumentId
        ),
        {
          fieldIndex,
          installedPanels,
          updatedByUid:
            currentUser.uid,
          updatedAt:
            serverTimestamp(),
        }
      );

      setDraftByIndex(
        (current) => ({
          ...current,
          [fieldIndex]: String(
            installedPanels
          ),
        })
      );

      setMessage(
        `Поле ${field.number}: сохранено ${installedPanels} из ${field.panels} панелей.`
      );
    } catch (error) {
      console.error(
        "Ошибка сохранения прогресса крыши:",
        error
      );

      setMessage(
        error?.message ||
          "Не удалось сохранить количество панелей."
      );
    } finally {
      setSavingIndex(null);
    }
  }

  async function changeAndSave(
    fieldIndex,
    difference
  ) {
    const field = roofFields.find(
      (item) =>
        item.index === fieldIndex
    );

    if (!field) {
      return;
    }

    const currentValue =
      clampInteger(
        getDraftValue(fieldIndex),
        0,
        field.panels
      );

    const nextValue = clampInteger(
      currentValue + difference,
      0,
      field.panels
    );

    setDraftByIndex(
      (current) => ({
        ...current,
        [fieldIndex]: String(
          nextValue
        ),
      })
    );

    await saveProgress(
      fieldIndex,
      nextValue
    );
  }

  function handleFileSelection(event) {
    const files = Array.from(
      event.target.files || []
    );

    setSelectedFiles(files);
    setMessage("");
  }

  async function uploadDocuments() {
    if (
      !canManageDocuments ||
      !currentUser ||
      !objectItem
    ) {
      return;
    }

    if (!selectedFiles.length) {
      setMessage(
        "Сначала выбери один или несколько файлов."
      );
      return;
    }

    for (const file of selectedFiles) {
      const extension = fileExtension(
        file.name
      );

      if (
        !ALLOWED_FILE_EXTENSIONS.has(
          extension
        )
      ) {
        setMessage(
          `Формат файла «${file.name}» не поддерживается.`
        );
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setMessage(
          `Файл «${file.name}» превышает ограничение 20 МБ.`
        );
        return;
      }
    }

    setUploadingFiles(true);
    setMessage("");

    let uploadedCount = 0;

    try {
      for (const file of selectedFiles) {
        const documentReference = doc(
          collection(
            db,
            "Objects",
            objectItem.id,
            "RoofDocuments"
          )
        );

        const safeFileName =
          sanitizeFileName(file.name);

        const storagePath =
          `Objects/${objectItem.id}` +
          `/RoofDocuments/${documentReference.id}` +
          `/${safeFileName}`;

        const storageReference = ref(
          storage,
          storagePath
        );

        let fileUploaded = false;

        try {
          await uploadBytes(
            storageReference,
            file,
            {
              contentType:
                file.type ||
                "application/octet-stream",

              customMetadata: {
                objectId:
                  objectItem.id,

                documentId:
                  documentReference.id,

                uploadedByUid:
                  currentUser.uid,
              },
            }
          );

          fileUploaded = true;

          const downloadURL =
            await getDownloadURL(
              storageReference
            );

          await setDoc(
            documentReference,
            {
              fileName: file.name,
              storagePath,
              downloadURL,

              contentType:
                file.type ||
                "application/octet-stream",

              size: file.size,

              uploadedByUid:
                currentUser.uid,

              uploadedAt:
                serverTimestamp(),
            }
          );

          uploadedCount += 1;
        } catch (error) {
          if (fileUploaded) {
            try {
              await deleteObject(
                storageReference
              );
            } catch {
              // Файл уже мог быть удалён.
            }
          }

          throw error;
        }
      }

      setSelectedFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value =
          "";
      }

      setMessage(
        uploadedCount === 1
          ? "Файл успешно загружен."
          : `Успешно загружено файлов: ${uploadedCount}.`
      );
    } catch (error) {
      console.error(
        "Ошибка загрузки документов:",
        error
      );

      setMessage(
        error?.message ||
          "Не удалось загрузить документ."
      );
    } finally {
      setUploadingFiles(false);
    }
  }

  async function deleteDocument(
    documentItem
  ) {
    if (
      !canManageDocuments ||
      !objectItem
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить файл «${documentItem.fileName}»?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingDocumentId(
      documentItem.id
    );

    setMessage("");

    try {
      if (documentItem.storagePath) {
        try {
          await deleteObject(
            ref(
              storage,
              documentItem.storagePath
            )
          );
        } catch (error) {
          if (
            error?.code !==
            "storage/object-not-found"
          ) {
            throw error;
          }
        }
      }

      await deleteDoc(
        doc(
          db,
          "Objects",
          objectItem.id,
          "RoofDocuments",
          documentItem.id
        )
      );

      setMessage(
        "Документ удалён."
      );
    } catch (error) {
      console.error(
        "Ошибка удаления документа:",
        error
      );

      setMessage(
        error?.message ||
          "Не удалось удалить документ."
      );
    } finally {
      setDeletingDocumentId("");
    }
  }

  if (loading) {
    return (
      <main className="loadingPage">
        <div className="loadingCard">
          Загрузка карты крыши…
        </div>

        <style jsx>{`
          .loadingPage {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 20px;
          }

          .loadingCard {
            padding: 20px 24px;
            border-radius: 18px;
            background: rgba(
              255,
              255,
              255,
              0.96
            );
            color: #1f2937;
            font-weight: 800;
            box-shadow: 0 14px 36px
              rgba(0, 0, 0, 0.15);
          }
        `}</style>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="errorPage">
        <div className="errorCard">
          <h1>Карта крыши</h1>

          <p>{pageError}</p>

          <Link href={backHref}>
            ← Вернуться назад
          </Link>
        </div>

        <style jsx>{`
          .errorPage {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 20px;
          }

          .errorCard {
            width: min(
              520px,
              100%
            );
            padding: 22px;
            border-radius: 18px;
            background: rgba(
              255,
              255,
              255,
              0.96
            );
            color: #1f2937 !important;
            box-shadow: 0 14px 36px
              rgba(0, 0, 0, 0.15);
          }

          .errorCard h1,
          .errorCard p {
            color: #1f2937 !important;
          }
        `}</style>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>
          Карта крыши |{" "}
          {objectItem?.name ||
            "Solar E-Tron"}
        </title>
      </Head>

      <main className="page">
        <div className="content">
          <div className="topBar">
            <div>
              <div className="companyName">
                Solar E-Tron
              </div>

              <h1>Карта крыши</h1>

              <p className="objectName">
                {objectItem?.name ||
                  objectItem?.id}
              </p>
            </div>

            <Link
              href={backHref}
              className="backButton"
            >
              ← Назад к объектам
            </Link>
          </div>

          <section className="summaryCard">
            <div className="summaryHeader">
              <div>
                <h2>
                  Общий прогресс крыши
                </h2>

                <p>
                  Доступ:{" "}
                  {roleLabel(
                    currentRole
                  )}
                </p>
              </div>

              <div className="totalPercent">
                {totalProgressPercent}%
              </div>
            </div>

            <div className="progressTrack">
              <div
                className="progressFill"
                style={{
                  width:
                    `${totalProgressPercent}%`,
                }}
              />
            </div>

            <div className="summaryGrid">
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
                  Запланировано
                </span>

                <strong>
                  {totalPlannedPanels}
                </strong>
              </div>

              <div className="summaryItem">
                <span>
                  Установлено
                </span>

                <strong>
                  {totalInstalledPanels}
                </strong>
              </div>

              <div className="summaryItem">
                <span>
                  Осталось
                </span>

                <strong>
                  {totalRemainingPanels}
                </strong>
              </div>
            </div>
          </section>

          <section className="documentsCard">
            <div className="documentsHeader">
              <div>
                <h2>
                  Документы и схема крыши
                </h2>

                <p>
                  Схемы расположения полей,
                  PDF, фотографии и
                  дополнительная документация.
                </p>
              </div>

              <div className="documentsCount">
                Файлов:{" "}
                {roofDocuments.length}
              </div>
            </div>

            {canManageDocuments ? (
              <div className="uploadBlock">
                <label className="fileLabel">
                  <span>
                    Выбрать файлы
                  </span>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    onChange={
                      handleFileSelection
                    }
                    disabled={
                      uploadingFiles
                    }
                  />
                </label>

                <div className="uploadInfo">
                  Разрешены PDF, изображения,
                  Word, Excel, PowerPoint и
                  TXT. Максимум 20 МБ на файл.
                </div>

                {selectedFiles.length >
                0 ? (
                  <div className="selectedFiles">
                    {selectedFiles.map(
                      (file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                        >
                          {file.name} —{" "}
                          {formatFileSize(
                            file.size
                          )}
                        </div>
                      )
                    )}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="uploadButton"
                  onClick={
                    uploadDocuments
                  }
                  disabled={
                    uploadingFiles ||
                    !selectedFiles.length
                  }
                >
                  {uploadingFiles
                    ? "Загрузка…"
                    : "Загрузить документы"}
                </button>
              </div>
            ) : (
              <div className="workerDocumentNote">
                Документы загружает директор
                или администратор. Работник
                может открывать и читать их.
              </div>
            )}

            {roofDocuments.length === 0 ? (
              <div className="emptyDocuments">
                Документы для этого объекта
                пока не загружены.
              </div>
            ) : (
              <div className="documentsGrid">
                {roofDocuments.map(
                  (documentItem) => (
                    <article
                      className="documentItem"
                      key={documentItem.id}
                    >
                      {isImageDocument(
                        documentItem
                      ) ? (
                        <a
                          href={
                            documentItem.downloadURL
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="imagePreviewLink"
                        >
                          <img
                            src={
                              documentItem.downloadURL
                            }
                            alt={
                              documentItem.fileName
                            }
                            className="imagePreview"
                          />
                        </a>
                      ) : (
                        <div className="fileTypeBox">
                          {documentTypeLabel(
                            documentItem
                          )}
                        </div>
                      )}

                      <div className="documentInfo">
                        <strong>
                          {
                            documentItem.fileName
                          }
                        </strong>

                        <span>
                          {formatFileSize(
                            documentItem.size
                          )}
                        </span>

                        <span>
                          Загружен:{" "}
                          {formatDate(
                            documentItem.uploadedAt
                          )}
                        </span>
                      </div>

                      <div className="documentActions">
                        <a
                          href={
                            documentItem.downloadURL
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="openDocumentButton"
                        >
                          Открыть
                        </a>

                        {canManageDocuments ? (
                          <button
                            type="button"
                            className="deleteDocumentButton"
                            onClick={() =>
                              deleteDocument(
                                documentItem
                              )
                            }
                            disabled={
                              deletingDocumentId ===
                              documentItem.id
                            }
                          >
                            {deletingDocumentId ===
                            documentItem.id
                              ? "Удаление…"
                              : "Удалить"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>

          {message ? (
            <div className="messageBox">
              {message}
            </div>
          ) : null}

          <section className="fieldsGrid">
            {roofFields.map((field) => {
              const installedPanels =
                progressByIndex[
                  field.index
                ]?.installedPanels || 0;

              const remainingPanels =
                Math.max(
                  field.panels -
                    installedPanels,
                  0
                );

              const progressPercent =
                field.panels > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (installedPanels /
                          field.panels) *
                          100
                      )
                    )
                  : 0;

              const isSaving =
                savingIndex ===
                field.index;

              return (
                <article
                  className="fieldCard"
                  key={`roof-field-${field.index}`}
                >
                  <div className="fieldHeader">
                    <div>
                      <div className="fieldLabel">
                        Поле крыши
                      </div>

                      <h2>
                        {field.number}
                      </h2>
                    </div>

                    <div className="fieldPercent">
                      {progressPercent}%
                    </div>
                  </div>

                  <div className="progressTrack small">
                    <div
                      className="progressFill"
                      style={{
                        width:
                          `${progressPercent}%`,
                      }}
                    />
                  </div>

                  <div className="fieldStats">
                    <div>
                      <span>План</span>

                      <strong>
                        {field.panels}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Установлено
                      </span>

                      <strong>
                        {
                          installedPanels
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Осталось
                      </span>

                      <strong>
                        {
                          remainingPanels
                        }
                      </strong>
                    </div>
                  </div>

                  <label className="inputGroup">
                    <span>
                      Установлено панелей
                    </span>

                    <input
                      type="number"
                      min="0"
                      max={field.panels}
                      step="1"
                      value={getDraftValue(
                        field.index
                      )}
                      onChange={(event) =>
                        updateDraft(
                          field.index,
                          event.target.value
                        )
                      }
                      disabled={isSaving}
                    />
                  </label>

                  <div className="quickButtons">
                    <button
                      type="button"
                      onClick={() =>
                        changeAndSave(
                          field.index,
                          -10
                        )
                      }
                      disabled={isSaving}
                    >
                      −10
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        changeAndSave(
                          field.index,
                          -1
                        )
                      }
                      disabled={isSaving}
                    >
                      −1
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        changeAndSave(
                          field.index,
                          1
                        )
                      }
                      disabled={isSaving}
                    >
                      +1
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        changeAndSave(
                          field.index,
                          10
                        )
                      }
                      disabled={isSaving}
                    >
                      +10
                    </button>
                  </div>

                  <button
                    type="button"
                    className="saveButton"
                    onClick={() =>
                      saveProgress(
                        field.index,
                        getDraftValue(
                          field.index
                        )
                      )
                    }
                    disabled={isSaving}
                  >
                    {isSaving
                      ? "Сохранение…"
                      : "Сохранить количество"}
                  </button>
                </article>
              );
            })}
          </section>
        </div>
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 28px 14px 56px;
          color: #1f1d18 !important;
        }

        .page h1,
        .page h2,
        .page p,
        .page strong,
        .page span {
          color: inherit;
        }

        .content {
          width: min(
            1180px,
            100%
          );
          margin: 0 auto;
        }

        .topBar,
        .summaryHeader,
        .fieldHeader,
        .documentsHeader {
          display: flex;
          align-items: center;
          justify-content:
            space-between;
          gap: 16px;
        }

        .topBar {
          margin-bottom: 20px;
        }

        .companyName {
          margin-bottom: 4px;
          color: #8a6817 !important;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          color: #1f1d18 !important;
          font-size: clamp(
            30px,
            5vw,
            44px
          );
        }

        h2 {
          margin: 0;
          color: #1f1d18 !important;
        }

        .objectName {
          margin: 6px 0 0;
          color: #5f5a50 !important;
          font-size: 18px;
          font-weight: 800;
        }

        .backButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 10px 15px;
          border: 1px solid #b8a77e;
          border-radius: 12px;
          background: #ffffff;
          color: #332e23 !important;
          font-weight: 800;
          text-decoration: none;
        }

        .summaryCard,
        .fieldCard,
        .documentsCard {
          border: 1px solid
            rgba(122, 92, 22, 0.2);
          background: rgba(
            255,
            251,
            239,
            0.96
          );
          box-shadow: 0 14px 38px
            rgba(52, 39, 11, 0.14);
        }

        .summaryCard,
        .documentsCard {
          padding: 22px;
          border-radius: 22px;
        }

        .documentsCard {
          margin-top: 20px;
        }

        .summaryHeader p,
        .documentsHeader p {
          margin: 6px 0 0;
          color: #655f52 !important;
        }

        .documentsCount {
          padding: 9px 12px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid
            rgba(0, 0, 0, 0.09);
          color: #4e493f !important;
          font-weight: 800;
          white-space: nowrap;
        }

        .totalPercent,
        .fieldPercent {
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #e6f3e8;
          color: #256232 !important;
          font-weight: 900;
        }

        .totalPercent {
          min-width: 78px;
          min-height: 78px;
          font-size: 23px;
        }

        .fieldPercent {
          min-width: 58px;
          min-height: 58px;
          font-size: 17px;
        }

        .progressTrack {
          height: 17px;
          margin-top: 18px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e1d7;
        }

        .progressTrack.small {
          height: 12px;
          margin-top: 14px;
        }

        .progressFill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            #4c9a5a,
            #73bd79
          );
          transition: width 0.25s ease;
        }

        .summaryGrid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 12px;
          margin-top: 18px;
        }

        .summaryItem {
          display: grid;
          gap: 5px;
          padding: 14px;
          border: 1px solid
            rgba(0, 0, 0, 0.08);
          border-radius: 14px;
          background: rgba(
            255,
            255,
            255,
            0.92
          );
        }

        .summaryItem span {
          color: #655f52 !important;
          font-size: 13px;
        }

        .summaryItem strong {
          color: #151410 !important;
          font-size: 27px;
        }

        .uploadBlock {
          display: grid;
          gap: 10px;
          margin-top: 18px;
          padding: 16px;
          border: 1px solid
            rgba(53, 95, 141, 0.2);
          border-radius: 15px;
          background: rgba(
            236,
            244,
            255,
            0.82
          );
        }

        .fileLabel {
          display: grid;
          gap: 7px;
        }

        .fileLabel span {
          color: #293d58 !important;
          font-weight: 900;
        }

        .fileLabel input {
          width: 100%;
          padding: 10px;
          border: 1px solid #aebed1;
          border-radius: 11px;
          background: #ffffff;
          color: #1f2937 !important;
        }

        .uploadInfo {
          color: #5d6877 !important;
          font-size: 13px;
        }

        .selectedFiles {
          display: grid;
          gap: 5px;
          padding: 10px 12px;
          border-radius: 11px;
          background: #ffffff;
          color: #344054 !important;
          font-size: 13px;
        }

        .uploadButton {
          width: fit-content;
          min-height: 44px;
          padding: 10px 16px;
          border: 1px solid #284d74;
          border-radius: 11px;
          background: #355f8d;
          color: #ffffff;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        .workerDocumentNote,
        .emptyDocuments {
          margin-top: 16px;
          padding: 13px 15px;
          border-radius: 13px;
          color: #5b554b !important;
        }

        .workerDocumentNote {
          background: #eef4fb;
          border: 1px solid #c7d8eb;
        }

        .emptyDocuments {
          background: rgba(
            255,
            255,
            255,
            0.75
          );
          border: 1px dashed
            rgba(0, 0, 0, 0.16);
        }

        .documentsGrid {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }

        .documentItem {
          display: grid;
          grid-template-columns:
            78px
            minmax(0, 1fr)
            auto;
          align-items: center;
          gap: 14px;
          padding: 13px;
          border: 1px solid
            rgba(0, 0, 0, 0.09);
          border-radius: 14px;
          background: rgba(
            255,
            255,
            255,
            0.9
          );
        }

        .imagePreviewLink {
          display: block;
          width: 78px;
          height: 70px;
          overflow: hidden;
          border-radius: 10px;
          background: #edf0f3;
        }

        .imagePreview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .fileTypeBox {
          display: grid;
          place-items: center;
          width: 78px;
          height: 70px;
          border-radius: 10px;
          background: #e8eef6;
          color: #355f8d !important;
          font-size: 13px;
          font-weight: 900;
        }

        .documentInfo {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .documentInfo strong {
          overflow: hidden;
          color: #1f2937 !important;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .documentInfo span {
          color: #667085 !important;
          font-size: 12px;
        }

        .documentActions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .openDocumentButton,
        .deleteDocumentButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 8px 13px;
          border-radius: 10px;
          font: inherit;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
        }

        .openDocumentButton {
          border: 1px solid #355f8d;
          background: #eef4fb;
          color: #294f7f !important;
        }

        .deleteDocumentButton {
          border: 1px solid #b04b4b;
          background: #fff3f3;
          color: #922f2f;
        }

        .messageBox {
          margin-top: 16px;
          padding: 13px 15px;
          border: 1px solid #d8ba56;
          border-radius: 13px;
          background: #fff3c9;
          color: #4c3b08 !important;
          font-weight: 800;
        }

        .fieldsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(290px, 1fr)
            );
          gap: 18px;
          margin-top: 20px;
        }

        .fieldCard {
          padding: 18px;
          border-radius: 19px;
          color: #1f1d18 !important;
        }

        .fieldLabel {
          margin-bottom: 4px;
          color: #6b6559 !important;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .fieldStats {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 8px;
          margin-top: 16px;
        }

        .fieldStats > div {
          display: grid;
          gap: 4px;
          padding: 11px 8px;
          border-radius: 12px;
          background: #ffffff;
          text-align: center;
        }

        .fieldStats span {
          color: #6b6559 !important;
          font-size: 12px;
        }

        .fieldStats strong {
          color: #151410 !important;
          font-size: 21px;
        }

        .inputGroup {
          display: grid;
          gap: 7px;
          margin-top: 16px;
        }

        .inputGroup span {
          color: #39342a !important;
          font-size: 14px;
          font-weight: 800;
        }

        .inputGroup input {
          width: 100%;
          min-height: 48px;
          padding: 10px 12px;
          border: 1px solid #cabd9d;
          border-radius: 12px;
          background: #ffffff;
          color: #181713 !important;
          -webkit-text-fill-color:
            #181713 !important;
          font: inherit;
          font-size: 18px;
          font-weight: 800;
          outline: none;
        }

        .quickButtons {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 7px;
          margin-top: 12px;
        }

        .quickButtons button {
          min-height: 42px;
          border: 1px solid #b8a77e;
          border-radius: 10px;
          background: #ffffff;
          color: #332e23;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        .saveButton {
          width: 100%;
          min-height: 46px;
          margin-top: 12px;
          border: 1px solid #73530d;
          border-radius: 11px;
          background: #967019;
          color: #ffffff;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 760px) {
          .topBar,
          .summaryHeader,
          .documentsHeader {
            align-items: stretch;
            flex-direction: column;
          }

          .backButton {
            width: 100%;
          }

          .totalPercent {
            width: 72px;
            min-height: 72px;
          }

          .summaryGrid {
            grid-template-columns:
              1fr 1fr;
          }

          .documentsCount {
            width: fit-content;
          }

          .documentItem {
            grid-template-columns:
              68px minmax(0, 1fr);
          }

          .imagePreviewLink,
          .fileTypeBox {
            width: 68px;
            height: 62px;
          }

          .documentActions {
            grid-column: 1 / -1;
            justify-content:
              flex-start;
          }
        }

        @media (max-width: 420px) {
          .page {
            padding: 16px 9px 42px;
          }

          .summaryCard,
          .documentsCard {
            padding: 16px;
            border-radius: 17px;
          }

          .fieldsGrid {
            grid-template-columns:
              1fr;
          }

          .fieldStats {
            grid-template-columns:
              1fr 1fr 1fr;
          }

          .documentActions {
            display: grid;
            grid-template-columns:
              1fr;
          }

          .openDocumentButton,
          .deleteDocumentButton,
          .uploadButton {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
