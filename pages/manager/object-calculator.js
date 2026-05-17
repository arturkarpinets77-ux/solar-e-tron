import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;

  const normalized = String(value)
    .replace(",", ".")
    .replace(/\s/g, "")
    .trim();

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatInputNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "";

  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;

  return String(rounded).replace(".", ",");
}

function money(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultWorkRows() {
  return [
    {
      id: makeId(),
      name: "Монтаж панелей",
      qty: "",
      unit: "шт",
      price: "",
    },
    {
      id: makeId(),
      name: "Монтаж конструкций",
      qty: "",
      unit: "шт",
      price: "",
    },
    {
      id: makeId(),
      name: "Подготовительные работы",
      qty: "",
      unit: "ч",
      price: "",
    },
    {
      id: makeId(),
      name: "Дополнительные работы",
      qty: "",
      unit: "ч",
      price: "",
    },
  ];
}

function createDefaultExpenseRows() {
  return [
    {
      id: makeId(),
      name: "Транспорт",
      qty: "",
      unit: "км / раз",
      price: "",
    },
    {
      id: makeId(),
      name: "Аренда техники",
      qty: "",
      unit: "день / ч",
      price: "",
    },
    {
      id: makeId(),
      name: "Материалы",
      qty: "",
      unit: "шт",
      price: "",
    },
    {
      id: makeId(),
      name: "Прочие расходы",
      qty: "",
      unit: "шт",
      price: "",
    },
  ];
}

function cleanRows(rows) {
  return rows.map((row) => ({
    id: row.id || makeId(),
    name: String(row.name || ""),
    qty: String(row.qty || ""),
    unit: String(row.unit || ""),
    price: String(row.price || ""),
  }));
}

function rowHasContent(row) {
  return (
    String(row.name || "").trim() ||
    String(row.qty || "").trim() ||
    String(row.unit || "").trim() ||
    String(row.price || "").trim()
  );
}

function formatSavedDate(value) {
  try {
    if (!value) return "-";

    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleString("fi-FI");
    }

    return String(value);
  } catch {
    return "-";
  }
}

function displayText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

export default function ObjectCalculatorPage() {
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [openedCalculationId, setOpenedCalculationId] = useState("");
  const [savedCalculations, setSavedCalculations] = useState([]);
  const [savedSearch, setSavedSearch] = useState("");

  const [info, setInfo] = useState({
    calculationNumber: "",
    objectName: "",
    objectAddress: "",
    customerName: "",
    calculationDate: todayDate(),
    comment: "",
  });

  const [workRows, setWorkRows] = useState(createDefaultWorkRows);
  const [expenseRows, setExpenseRows] = useState(createDefaultExpenseRows);

  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [alvPercent, setAlvPercent] = useState("25,5");

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      setMsg("");

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const userRef = doc(db, "Users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          router.replace("/login");
          return;
        }

        const data = userSnap.data() || {};
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

        setProfile({
          uid: user.uid,
          role,
          status,
          email: String(data.email || user.email || ""),
          firstName: String(data.firstName || ""),
          lastName: String(data.lastName || ""),
        });

        await loadSavedCalculations();
      } catch (e) {
        setMsg(e?.message || "Ошибка проверки доступа");
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  function updateInfo(field, value) {
    setInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateRow(type, id, field, value) {
    const setter = type === "work" ? setWorkRows : setExpenseRows;

    setter((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  }

  function addRow(type) {
    const newRow = {
      id: makeId(),
      name: "",
      qty: "",
      unit: "",
      price: "",
    };

    if (type === "work") {
      setWorkRows((rows) => [...rows, newRow]);
    } else {
      setExpenseRows((rows) => [...rows, newRow]);
    }
  }

  function removeRow(type, id) {
    if (type === "work") {
      setWorkRows((rows) => rows.filter((row) => row.id !== id));
    } else {
      setExpenseRows((rows) => rows.filter((row) => row.id !== id));
    }
  }

  function rowSum(row) {
    return toNumber(row.qty) * toNumber(row.price);
  }

  const totals = useMemo(() => {
    const worksTotal = workRows.reduce((sum, row) => sum + rowSum(row), 0);
    const expensesTotal = expenseRows.reduce((sum, row) => sum + rowSum(row), 0);

    const baseTotal = worksTotal + expensesTotal;
    const discountInput = toNumber(discount);
    const alvValue = toNumber(alvPercent);

    let discountValue = 0;

    if (discountType === "percent") {
      discountValue = baseTotal * (discountInput / 100);
    } else {
      discountValue = discountInput;
    }

    const subtotalBeforeAlv = Math.max(0, baseTotal - discountValue);
    const alvAmount = subtotalBeforeAlv * (alvValue / 100);
    const finalTotal = subtotalBeforeAlv + alvAmount;

    return {
      worksTotal,
      expensesTotal,
      baseTotal,
      discountInput,
      discountType,
      discountValue,
      subtotalBeforeAlv,
      alvAmount,
      finalTotal,
    };
  }, [workRows, expenseRows, discount, discountType, alvPercent]);

  const printableWorkRows = useMemo(() => {
    return workRows.filter(rowHasContent);
  }, [workRows]);

  const printableExpenseRows = useMemo(() => {
    return expenseRows.filter(rowHasContent);
  }, [expenseRows]);

  const filteredSavedCalculations = useMemo(() => {
    const search = savedSearch.trim().toLowerCase();

    if (!search) return savedCalculations;

    return savedCalculations.filter((item) => {
      const text = [
        item.calculationNumber,
        item.objectName,
        item.objectAddress,
        item.customerName,
        item.calculationDate,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return text.includes(search);
    });
  }, [savedCalculations, savedSearch]);

  function handleDiscountTypeChange(nextType) {
    if (nextType === discountType) return;

    const baseTotal = totals.baseTotal;
    const currentDiscount = toNumber(discount);

    if (!baseTotal || baseTotal <= 0) {
      setDiscountType(nextType);
      return;
    }

    if (discountType === "amount" && nextType === "percent") {
      const percentValue = (currentDiscount / baseTotal) * 100;
      setDiscount(formatInputNumber(percentValue));
      setDiscountType("percent");
      return;
    }

    if (discountType === "percent" && nextType === "amount") {
      const amountValue = baseTotal * (currentDiscount / 100);
      setDiscount(formatInputNumber(amountValue));
      setDiscountType("amount");
      return;
    }

    setDiscountType(nextType);
  }

  function buildPayload() {
    return {
      calculationNumber: String(info.calculationNumber || "").trim(),
      objectName: String(info.objectName || "").trim(),
      objectAddress: String(info.objectAddress || "").trim(),
      customerName: String(info.customerName || "").trim(),
      calculationDate: String(info.calculationDate || ""),
      comment: String(info.comment || ""),

      workRows: cleanRows(workRows),
      expenseRows: cleanRows(expenseRows),

      discount: String(discount || ""),
      discountType: String(discountType || "amount"),
      alvPercent: String(alvPercent || ""),

      totals: {
        worksTotal: totals.worksTotal,
        expensesTotal: totals.expensesTotal,
        baseTotal: totals.baseTotal,
        discountInput: totals.discountInput,
        discountType: totals.discountType,
        discountValue: totals.discountValue,
        subtotalBeforeAlv: totals.subtotalBeforeAlv,
        alvAmount: totals.alvAmount,
        finalTotal: totals.finalTotal,
      },

      updatedBy: profile?.uid || "",
      updatedAt: serverTimestamp(),
    };
  }

  async function loadSavedCalculations() {
    if (!db) return;

    setLoadingSaved(true);

    try {
      const ref = collection(db, "ObjectCalculations");
      const q = query(ref, orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);

      const list = snap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setSavedCalculations(list);
    } catch (e) {
      setMsg(e?.message || "Ошибка загрузки сохранённых расчётов");
    } finally {
      setLoadingSaved(false);
    }
  }

  async function saveAsNewCalculation() {
    if (!profile?.uid) return;

    setSaving(true);
    setMsg("");

    try {
      const payload = {
        ...buildPayload(),
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "ObjectCalculations"), payload);

      setOpenedCalculationId(ref.id);
      await loadSavedCalculations();

      setMsg("Расчёт сохранён как новый.");
    } catch (e) {
      setMsg(e?.message || "Ошибка сохранения расчёта");
    } finally {
      setSaving(false);
    }
  }

  async function updateOpenedCalculation() {
    if (!openedCalculationId) {
      setMsg("Сначала открой сохранённый расчёт или сохрани как новый.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const ref = doc(db, "ObjectCalculations", openedCalculationId);
      await updateDoc(ref, buildPayload());

      await loadSavedCalculations();

      setMsg("Открытый расчёт обновлён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка обновления расчёта");
    } finally {
      setSaving(false);
    }
  }

  function openSavedCalculation(item) {
    setOpenedCalculationId(item.id);

    setInfo({
      calculationNumber: String(item.calculationNumber || ""),
      objectName: String(item.objectName || ""),
      objectAddress: String(item.objectAddress || ""),
      customerName: String(item.customerName || ""),
      calculationDate: String(item.calculationDate || todayDate()),
      comment: String(item.comment || ""),
    });

    setWorkRows(
      Array.isArray(item.workRows) && item.workRows.length > 0
        ? cleanRows(item.workRows)
        : createDefaultWorkRows()
    );

    setExpenseRows(
      Array.isArray(item.expenseRows) && item.expenseRows.length > 0
        ? cleanRows(item.expenseRows)
        : createDefaultExpenseRows()
    );

    setDiscount(String(item.discount || ""));
    setDiscountType(String(item.discountType || item?.totals?.discountType || "amount"));
    setAlvPercent(String(item.alvPercent || "25,5"));

    setMsg("Расчёт открыт для редактирования.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteSavedCalculation(id) {
    const ok = window.confirm("Удалить этот расчёт?");
    if (!ok) return;

    setSaving(true);
    setMsg("");

    try {
      await deleteDoc(doc(db, "ObjectCalculations", id));

      if (openedCalculationId === id) {
        setOpenedCalculationId("");
      }

      await loadSavedCalculations();
      setMsg("Расчёт удалён.");
    } catch (e) {
      setMsg(e?.message || "Ошибка удаления расчёта");
    } finally {
      setSaving(false);
    }
  }

  function printReport() {
    window.print();
  }

  function clearCalculator() {
    const confirmClear = window.confirm("Очистить форму расчёта?");
    if (!confirmClear) return;

    setOpenedCalculationId("");

    setInfo({
      calculationNumber: "",
      objectName: "",
      objectAddress: "",
      customerName: "",
      calculationDate: todayDate(),
      comment: "",
    });

    setWorkRows(createDefaultWorkRows());
    setExpenseRows(createDefaultExpenseRows());
    setDiscount("");
    setDiscountType("amount");
    setAlvPercent("25,5");
    setMsg("Форма очищена.");
  }

  function discountLabel() {
    if (discountType === "percent") {
      return `${displayText(discount, "0")} %`;
    }

    return `${displayText(discount, "0")} €`;
  }

  if (authLoading) {
    return (
      <main className="page">
        <section className="calculatorCard">
          <h1>Калькулятор объекта</h1>
          <p>Загрузка...</p>
        </section>

        <style jsx>{`
          .page {
            min-height: 100vh;
            padding: 32px;
            background: linear-gradient(180deg, rgba(235, 248, 255, 0.95), rgba(255, 250, 235, 0.95));
            color: #263238;
            font-family: Arial, sans-serif;
          }

          .calculatorCard {
            max-width: 1180px;
            margin: 0 auto;
            padding: 28px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
          }
        `}</style>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Калькулятор объекта | Solar E-Tron</title>
      </Head>

      <main className="page">
        <section className="calculatorCard screenDocument">
          <div className="topBar noPrint">
            <div>
              <h1>Калькулятор объекта</h1>
              <p>Помощник для расчёта стоимости объекта и подготовки PDF-отчёта.</p>

              {openedCalculationId ? (
                <p className="openedText">Открыт сохранённый расчёт. Можно обновить его или сохранить как новый.</p>
              ) : (
                <p className="openedText">Новый расчёт. После заполнения можно сохранить в базе.</p>
              )}
            </div>

            <div className="topActions">
              <Link href="/manager" className="secondaryButton">
                Назад в кабинет
              </Link>

              <button type="button" className="secondaryButton" onClick={clearCalculator}>
                Очистить
              </button>

              <button type="button" className="primaryButton" onClick={printReport}>
                Печать / PDF
              </button>
            </div>
          </div>

          {msg ? <div className="msg noPrint">{msg}</div> : null}

          <section className="block noPrint">
            <h2>Сохранение расчёта</h2>

            <div className="saveActions">
              <button
                type="button"
                className="primaryButton"
                onClick={saveAsNewCalculation}
                disabled={saving}
              >
                Сохранить как новый
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={updateOpenedCalculation}
                disabled={saving || !openedCalculationId}
              >
                Обновить открытый расчёт
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={loadSavedCalculations}
                disabled={loadingSaved}
              >
                Обновить список
              </button>
            </div>
          </section>

          <section className="block">
            <h2>Информация по расчёту</h2>

            <div className="infoGrid">
              <label>
                Номер расчёта / счёта
                <input
                  value={info.calculationNumber}
                  onChange={(e) => updateInfo("calculationNumber", e.target.value)}
                  placeholder="Например: 2026-001"
                />
              </label>

              <label>
                Дата расчёта
                <input
                  type="date"
                  value={info.calculationDate}
                  onChange={(e) => updateInfo("calculationDate", e.target.value)}
                />
              </label>

              <label>
                Название объекта
                <input
                  value={info.objectName}
                  onChange={(e) => updateInfo("objectName", e.target.value)}
                  placeholder="Название объекта"
                />
              </label>

              <label>
                Адрес объекта
                <input
                  value={info.objectAddress}
                  onChange={(e) => updateInfo("objectAddress", e.target.value)}
                  placeholder="Адрес объекта"
                />
              </label>

              <label>
                Заказчик
                <input
                  value={info.customerName}
                  onChange={(e) => updateInfo("customerName", e.target.value)}
                  placeholder="Имя / компания заказчика"
                />
              </label>
            </div>
          </section>

          <section className="block">
            <div className="sectionTitle">
              <h2>Работы</h2>

              <button type="button" className="smallButton noPrint" onClick={() => addRow("work")}>
                + Добавить работу
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Название работы</th>
                    <th>Количество</th>
                    <th>Ед.</th>
                    <th>Цена за ед.</th>
                    <th>Сумма</th>
                    <th className="noPrint">Удалить</th>
                  </tr>
                </thead>

                <tbody>
                  {workRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={row.name}
                          onChange={(e) => updateRow("work", row.id, "name", e.target.value)}
                          placeholder="Название работы"
                        />
                      </td>

                      <td>
                        <input
                          value={row.qty}
                          onChange={(e) => updateRow("work", row.id, "qty", e.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>

                      <td>
                        <input
                          value={row.unit}
                          onChange={(e) => updateRow("work", row.id, "unit", e.target.value)}
                          placeholder="шт"
                        />
                      </td>

                      <td>
                        <input
                          value={row.price}
                          onChange={(e) => updateRow("work", row.id, "price", e.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>

                      <td className="sumCell">{money(rowSum(row))}</td>

                      <td className="noPrint">
                        <button
                          type="button"
                          className="deleteButton"
                          onClick={() => removeRow("work", row.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="block">
            <div className="sectionTitle">
              <h2>Дополнительные расходы</h2>

              <button
                type="button"
                className="smallButton noPrint"
                onClick={() => addRow("expense")}
              >
                + Добавить расход
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Название расхода</th>
                    <th>Количество</th>
                    <th>Ед.</th>
                    <th>Цена за ед.</th>
                    <th>Сумма</th>
                    <th className="noPrint">Удалить</th>
                  </tr>
                </thead>

                <tbody>
                  {expenseRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={row.name}
                          onChange={(e) => updateRow("expense", row.id, "name", e.target.value)}
                          placeholder="Название расхода"
                        />
                      </td>

                      <td>
                        <input
                          value={row.qty}
                          onChange={(e) => updateRow("expense", row.id, "qty", e.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>

                      <td>
                        <input
                          value={row.unit}
                          onChange={(e) => updateRow("expense", row.id, "unit", e.target.value)}
                          placeholder="шт"
                        />
                      </td>

                      <td>
                        <input
                          value={row.price}
                          onChange={(e) => updateRow("expense", row.id, "price", e.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>

                      <td className="sumCell">{money(rowSum(row))}</td>

                      <td className="noPrint">
                        <button
                          type="button"
                          className="deleteButton"
                          onClick={() => removeRow("expense", row.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="block">
            <h2>Итоговый расчёт</h2>

            <div className="summaryGrid">
              <div className="summaryRow">
                <span>Сумма работ:</span>
                <strong>{money(totals.worksTotal)}</strong>
              </div>

              <div className="summaryRow">
                <span>Дополнительные расходы:</span>
                <strong>{money(totals.expensesTotal)}</strong>
              </div>

              <div className="summaryRow">
                <span>Сумма до скидки:</span>
                <strong>{money(totals.baseTotal)}</strong>
              </div>

              <div className="summaryRow editableRow">
                <span>Скидка:</span>

                <div className="discountControl">
                  <input
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                  />

                  <select
                    value={discountType}
                    onChange={(e) => handleDiscountTypeChange(e.target.value)}
                  >
                    <option value="amount">€</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>

              <div className="summaryRow">
                <span>Сумма скидки:</span>
                <strong>{money(totals.discountValue)}</strong>
              </div>

              <div className="summaryRow">
                <span>Сумма без ALV:</span>
                <strong>{money(totals.subtotalBeforeAlv)}</strong>
              </div>

              <div className="summaryRow editableRow">
                <span>ALV %:</span>
                <input
                  value={alvPercent}
                  onChange={(e) => setAlvPercent(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>

              <div className="summaryRow">
                <span>ALV сумма:</span>
                <strong>{money(totals.alvAmount)}</strong>
              </div>

              <div className="summaryRow finalRow">
                <span>Итого к оплате:</span>
                <strong>{money(totals.finalTotal)}</strong>
              </div>
            </div>
          </section>

          <section className="block">
            <h2>Комментарий</h2>

            <textarea
              value={info.comment}
              onChange={(e) => updateInfo("comment", e.target.value)}
              placeholder="Дополнительный комментарий к расчёту"
            />
          </section>

          <section className="block noPrint">
            <div className="compactSavedHeader">
              <div>
                <h2>Сохранённые расчёты</h2>
                <p>
                  Всего: {savedCalculations.length}. Показано: {filteredSavedCalculations.length}.
                </p>
              </div>

              <div className="savedHeaderActions">
                <input
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder="Поиск: номер, объект, заказчик"
                  className="savedSearchInput"
                />

                <button
                  type="button"
                  className="smallButton"
                  onClick={loadSavedCalculations}
                  disabled={loadingSaved}
                >
                  Обновить
                </button>
              </div>
            </div>

            {loadingSaved ? <p>Загрузка сохранённых расчётов...</p> : null}

            {!loadingSaved && savedCalculations.length === 0 ? (
              <p>Сохранённых расчётов пока нет.</p>
            ) : null}

            {!loadingSaved && savedCalculations.length > 0 && filteredSavedCalculations.length === 0 ? (
              <p>По этому поиску ничего не найдено.</p>
            ) : null}

            {filteredSavedCalculations.length > 0 ? (
              <div className="compactSavedWrap">
                <table className="compactSavedTable">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Объект</th>
                      <th>Заказчик</th>
                      <th>Дата</th>
                      <th>Итого</th>
                      <th>Обновлено</th>
                      <th>Действия</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSavedCalculations.map((item) => (
                      <tr
                        key={item.id}
                        className={openedCalculationId === item.id ? "activeSavedRow" : ""}
                      >
                        <td>
                          <strong>{item.calculationNumber || "—"}</strong>
                        </td>

                        <td>{item.objectName || "—"}</td>
                        <td>{item.customerName || "—"}</td>
                        <td>{item.calculationDate || "—"}</td>
                        <td className="savedMoneyCell">{money(item?.totals?.finalTotal || 0)}</td>
                        <td>{formatSavedDate(item.updatedAt)}</td>

                        <td>
                          <div className="savedTableActions">
                            <button
                              type="button"
                              className="miniOpenButton"
                              onClick={() => openSavedCalculation(item)}
                            >
                              Открыть
                            </button>

                            <button
                              type="button"
                              className="miniDeleteButton"
                              onClick={() => deleteSavedCalculation(item.id)}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <div className="bottomActions noPrint">
            <Link href="/manager" className="secondaryButton">
              Назад в кабинет
            </Link>

            <button
              type="button"
              className="secondaryButton"
              onClick={saveAsNewCalculation}
              disabled={saving}
            >
              Сохранить как новый
            </button>

            <button
              type="button"
              className="secondaryButton"
              onClick={updateOpenedCalculation}
              disabled={saving || !openedCalculationId}
            >
              Обновить открытый
            </button>

            <button type="button" className="primaryButton" onClick={printReport}>
              Печать / сохранить PDF
            </button>
          </div>
        </section>

        <section className="printDocument">
          <div className="printTop">
            <div>
              <div className="printCompany">Solar E-Tron</div>
              <div className="printSubtitle">Расчёт стоимости объекта</div>
            </div>

            <div className="printMetaBox">
              <div>
                <span>Номер:</span>
                <strong>{displayText(info.calculationNumber)}</strong>
              </div>
              <div>
                <span>Дата:</span>
                <strong>{displayText(info.calculationDate)}</strong>
              </div>
            </div>
          </div>

          <div className="printInfoGrid">
            <div className="printInfoItem">
              <span>Заказчик</span>
              <strong>{displayText(info.customerName)}</strong>
            </div>

            <div className="printInfoItem">
              <span>Объект</span>
              <strong>{displayText(info.objectName)}</strong>
            </div>

            <div className="printInfoItem printWide">
              <span>Адрес объекта</span>
              <strong>{displayText(info.objectAddress)}</strong>
            </div>
          </div>

          <div className="printSection">
            <h2>Работы</h2>

            <table className="printTable">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Название</th>
                  <th>Кол-во</th>
                  <th>Ед.</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                </tr>
              </thead>

              <tbody>
                {printableWorkRows.length > 0 ? (
                  printableWorkRows.map((row, index) => (
                    <tr key={row.id || index}>
                      <td>{index + 1}</td>
                      <td>{displayText(row.name)}</td>
                      <td>{displayText(row.qty)}</td>
                      <td>{displayText(row.unit)}</td>
                      <td>{money(toNumber(row.price))}</td>
                      <td>{money(rowSum(row))}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6">Работы не указаны</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="printSection">
            <h2>Дополнительные расходы</h2>

            <table className="printTable">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Название</th>
                  <th>Кол-во</th>
                  <th>Ед.</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                </tr>
              </thead>

              <tbody>
                {printableExpenseRows.length > 0 ? (
                  printableExpenseRows.map((row, index) => (
                    <tr key={row.id || index}>
                      <td>{index + 1}</td>
                      <td>{displayText(row.name)}</td>
                      <td>{displayText(row.qty)}</td>
                      <td>{displayText(row.unit)}</td>
                      <td>{money(toNumber(row.price))}</td>
                      <td>{money(rowSum(row))}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6">Дополнительные расходы не указаны</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="printTotalsWrap">
            <div className="printTotals">
              <div>
                <span>Сумма работ</span>
                <strong>{money(totals.worksTotal)}</strong>
              </div>

              <div>
                <span>Дополнительные расходы</span>
                <strong>{money(totals.expensesTotal)}</strong>
              </div>

              <div>
                <span>Сумма до скидки</span>
                <strong>{money(totals.baseTotal)}</strong>
              </div>

              <div>
                <span>Скидка ({discountLabel()})</span>
                <strong>- {money(totals.discountValue)}</strong>
              </div>

              <div>
                <span>Сумма без ALV</span>
                <strong>{money(totals.subtotalBeforeAlv)}</strong>
              </div>

              <div>
                <span>ALV {displayText(alvPercent, "0")} %</span>
                <strong>{money(totals.alvAmount)}</strong>
              </div>

              <div className="printFinalTotal">
                <span>Итого к оплате</span>
                <strong>{money(totals.finalTotal)}</strong>
              </div>
            </div>
          </div>

          {String(info.comment || "").trim() ? (
            <div className="printSection">
              <h2>Комментарий</h2>
              <p className="printComment">{info.comment}</p>
            </div>
          ) : null}

          <div className="printFooter">
            <div>Solar E-Tron</div>
            <div>
              Подготовлено:{" "}
              {displayText(
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() ||
                  profile?.email
              )}
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 32px;
          background: linear-gradient(180deg, rgba(235, 248, 255, 0.95), rgba(255, 250, 235, 0.95));
          color: #263238;
          font-family: Arial, sans-serif;
        }

        .calculatorCard {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
        }

        .printDocument {
          display: none;
        }

        .topBar {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 22px;
        }

        h1 {
          margin: 0;
          font-size: 36px;
          line-height: 1.2;
        }

        h2 {
          margin: 0 0 16px;
          font-size: 22px;
        }

        p {
          margin: 8px 0 0;
          color: #607d8b;
        }

        .openedText {
          font-size: 14px;
          color: #607d8b;
        }

        .msg {
          margin: 14px 0;
          padding: 12px 14px;
          border-radius: 14px;
          background: #fff8e1;
          color: #5d4037;
          font-weight: 700;
        }

        .topActions,
        .bottomActions,
        .saveActions,
        .savedHeaderActions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .primaryButton,
        .secondaryButton,
        .smallButton {
          border: none;
          border-radius: 14px;
          padding: 12px 18px;
          cursor: pointer;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
        }

        .primaryButton {
          background: #1976d2;
          color: white;
        }

        .secondaryButton {
          background: #eceff1;
          color: #263238;
        }

        .smallButton {
          background: #e3f2fd;
          color: #0d47a1;
          padding: 10px 14px;
        }

        .primaryButton:disabled,
        .secondaryButton:disabled,
        .smallButton:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .block {
          margin-top: 18px;
          padding: 20px;
          border-radius: 20px;
          background: rgba(250, 250, 250, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .infoGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          font-weight: 700;
        }

        input,
        textarea,
        select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cfd8dc;
          border-radius: 12px;
          padding: 11px 12px;
          font-size: 15px;
          background: white;
          color: #263238;
        }

        textarea {
          min-height: 100px;
          resize: vertical;
        }

        .sectionTitle {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 850px;
        }

        th,
        td {
          border-bottom: 1px solid #e0e0e0;
          padding: 10px;
          text-align: left;
          vertical-align: middle;
        }

        th {
          background: #f5f5f5;
          font-size: 14px;
        }

        td input {
          min-width: 120px;
        }

        .sumCell {
          font-weight: 700;
          white-space: nowrap;
        }

        .deleteButton {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 10px;
          background: #ffebee;
          color: #b71c1c;
          font-size: 22px;
          cursor: pointer;
        }

        .summaryGrid {
          max-width: 560px;
          margin-left: auto;
          display: grid;
          gap: 10px;
        }

        .summaryRow {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #e0e0e0;
        }

        .editableRow input {
          max-width: 160px;
          text-align: right;
        }

        .discountControl {
          display: grid;
          grid-template-columns: 1fr 76px;
          gap: 8px;
          max-width: 240px;
        }

        .discountControl input {
          max-width: none;
        }

        .discountControl select {
          text-align: center;
          font-weight: 700;
        }

        .finalRow {
          font-size: 24px;
          border-bottom: none;
          color: #0d47a1;
        }

        .compactSavedHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .compactSavedHeader h2 {
          margin-bottom: 4px;
        }

        .compactSavedHeader p {
          margin: 0;
          font-size: 14px;
        }

        .savedSearchInput {
          min-width: 280px;
          max-width: 360px;
        }

        .compactSavedWrap {
          max-height: 360px;
          overflow: auto;
          border: 1px solid #e0e0e0;
          border-radius: 16px;
          background: white;
        }

        .compactSavedTable {
          min-width: 900px;
          width: 100%;
          border-collapse: collapse;
        }

        .compactSavedTable th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f5f5f5;
          font-size: 13px;
          white-space: nowrap;
        }

        .compactSavedTable th,
        .compactSavedTable td {
          padding: 9px 10px;
          border-bottom: 1px solid #eeeeee;
          font-size: 13px;
        }

        .compactSavedTable tr:last-child td {
          border-bottom: none;
        }

        .activeSavedRow {
          background: #e3f2fd;
        }

        .savedMoneyCell {
          font-weight: 800;
          white-space: nowrap;
        }

        .savedTableActions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .miniOpenButton,
        .miniDeleteButton {
          border: none;
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
          white-space: nowrap;
        }

        .miniOpenButton {
          background: #e3f2fd;
          color: #0d47a1;
        }

        .miniDeleteButton {
          background: #ffebee;
          color: #b71c1c;
        }

        .bottomActions {
          margin-top: 22px;
        }

        @media (max-width: 760px) {
          .page {
            padding: 16px;
          }

          .calculatorCard {
            padding: 18px;
          }

          .topBar {
            flex-direction: column;
          }

          .topActions,
          .bottomActions,
          .saveActions,
          .savedHeaderActions {
            justify-content: stretch;
          }

          .primaryButton,
          .secondaryButton,
          .smallButton {
            width: 100%;
          }

          .infoGrid {
            grid-template-columns: 1fr;
          }

          .summaryRow {
            align-items: flex-start;
            flex-direction: column;
          }

          .editableRow input {
            max-width: none;
          }

          .discountControl {
            width: 100%;
            max-width: none;
          }

          .compactSavedHeader {
            flex-direction: column;
          }

          .savedSearchInput {
            min-width: 0;
            max-width: none;
          }

          h1 {
            font-size: 30px;
          }
        }

        @media print {
          .page {
            min-height: auto;
            padding: 0;
            background: white;
            color: #111;
            font-family: Arial, sans-serif;
          }

          .screenDocument,
          .noPrint {
            display: none !important;
          }

          .printDocument {
            display: block;
            width: 100%;
            background: white;
            color: #111;
          }

          .printTop {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            align-items: flex-start;
            padding-bottom: 16px;
            border-bottom: 2px solid #111;
          }

          .printCompany {
            font-size: 30px;
            font-weight: 800;
            letter-spacing: 0.2px;
          }

          .printSubtitle {
            margin-top: 5px;
            font-size: 15px;
            color: #444;
          }

          .printMetaBox {
            min-width: 220px;
            display: grid;
            gap: 7px;
            font-size: 13px;
          }

          .printMetaBox div {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 4px;
          }

          .printMetaBox span {
            color: #555;
          }

          .printInfoGrid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 16px;
          }

          .printInfoItem {
            border: 1px solid #ddd;
            padding: 9px 10px;
          }

          .printInfoItem span {
            display: block;
            font-size: 11px;
            color: #555;
            text-transform: uppercase;
            margin-bottom: 4px;
          }

          .printInfoItem strong {
            font-size: 14px;
          }

          .printWide {
            grid-column: 1 / -1;
          }

          .printSection {
            margin-top: 18px;
            break-inside: avoid;
          }

          .printSection h2 {
            margin: 0 0 8px;
            font-size: 17px;
          }

          .printTable {
            width: 100%;
            min-width: 0;
            border-collapse: collapse;
            font-size: 12px;
          }

          .printTable th,
          .printTable td {
            border: 1px solid #ccc;
            padding: 6px 7px;
            text-align: left;
            vertical-align: top;
          }

          .printTable th {
            background: #f1f1f1;
            font-weight: 800;
          }

          .printTable th:nth-child(1),
          .printTable td:nth-child(1) {
            width: 36px;
            text-align: center;
          }

          .printTable th:nth-child(3),
          .printTable td:nth-child(3),
          .printTable th:nth-child(4),
          .printTable td:nth-child(4) {
            width: 70px;
          }

          .printTable th:nth-child(5),
          .printTable td:nth-child(5),
          .printTable th:nth-child(6),
          .printTable td:nth-child(6) {
            width: 95px;
            text-align: right;
            white-space: nowrap;
          }

          .printTotalsWrap {
            display: flex;
            justify-content: flex-end;
            margin-top: 18px;
            break-inside: avoid;
          }

          .printTotals {
            width: 360px;
            border: 1px solid #ccc;
          }

          .printTotals div {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 7px 9px;
            border-bottom: 1px solid #ddd;
            font-size: 13px;
          }

          .printTotals div:last-child {
            border-bottom: none;
          }

          .printTotals span {
            color: #333;
          }

          .printFinalTotal {
            background: #f1f1f1;
            font-size: 16px !important;
            font-weight: 800;
          }

          .printComment {
            margin: 0;
            padding: 10px;
            border: 1px solid #ddd;
            color: #111;
            white-space: pre-wrap;
            font-size: 13px;
          }

          .printFooter {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 28px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            font-size: 11px;
            color: #555;
          }

          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>
    </>
  );
}
