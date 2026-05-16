import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";

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

function money(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const defaultWorkRows = [
  {
    id: makeId(),
    name: "Монтаж панелей",
    qty: "",
    unit: "шт.",
    price: "",
  },
  {
    id: makeId(),
    name: "Монтаж конструкций",
    qty: "",
    unit: "шт.",
    price: "",
  },
  {
    id: makeId(),
    name: "Подготовительные работы",
    qty: "",
    unit: "ч.",
    price: "",
  },
  {
    id: makeId(),
    name: "Дополнительные работы",
    qty: "",
    unit: "ч.",
    price: "",
  },
];

const defaultExpenseRows = [
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
    unit: "день / ч.",
    price: "",
  },
  {
    id: makeId(),
    name: "Материалы",
    qty: "",
    unit: "шт.",
    price: "",
  },
  {
    id: makeId(),
    name: "Прочие расходы",
    qty: "",
    unit: "шт.",
    price: "",
  },
];

export default function ObjectCalculatorPage() {
  const [info, setInfo] = useState({
    calculationNumber: "",
    objectName: "",
    objectAddress: "",
    customerName: "",
    calculationDate: todayDate(),
    comment: "",
  });

  const [workRows, setWorkRows] = useState(defaultWorkRows);
  const [expenseRows, setExpenseRows] = useState(defaultExpenseRows);

  const [discount, setDiscount] = useState("");
  const [alvPercent, setAlvPercent] = useState("25,5");

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

    const discountValue = toNumber(discount);
    const alvValue = toNumber(alvPercent);

    const subtotalBeforeAlv = Math.max(0, worksTotal + expensesTotal - discountValue);
    const alvAmount = subtotalBeforeAlv * (alvValue / 100);
    const finalTotal = subtotalBeforeAlv + alvAmount;

    return {
      worksTotal,
      expensesTotal,
      discountValue,
      subtotalBeforeAlv,
      alvAmount,
      finalTotal,
    };
  }, [workRows, expenseRows, discount, alvPercent]);

  function printReport() {
    window.print();
  }

  function clearCalculator() {
    const confirmClear = window.confirm("Очистить весь расчёт?");
    if (!confirmClear) return;

    setInfo({
      calculationNumber: "",
      objectName: "",
      objectAddress: "",
      customerName: "",
      calculationDate: todayDate(),
      comment: "",
    });

    setWorkRows(defaultWorkRows.map((row) => ({ ...row, id: makeId(), qty: "", price: "" })));
    setExpenseRows(defaultExpenseRows.map((row) => ({ ...row, id: makeId(), qty: "", price: "" })));
    setDiscount("");
    setAlvPercent("25,5");
  }

  return (
    <>
      <Head>
        <title>Калькулятор объекта | Solar E-Tron</title>
      </Head>

      <main className="page">
        <section className="calculatorCard">
          <div className="topBar noPrint">
            <div>
              <h1>Калькулятор объекта</h1>
              <p>Помощник для расчёта стоимости объекта и подготовки PDF-отчёта.</p>
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

          <div className="printHeader">
            <h2>Solar E-Tron</h2>
            <p>Расчёт стоимости объекта</p>
          </div>

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
                          placeholder="шт."
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
                          placeholder="шт."
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

              <div className="summaryRow editableRow">
                <span>Скидка:</span>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
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

          <div className="bottomActions noPrint">
            <Link href="/manager" className="secondaryButton">
              Назад в кабинет
            </Link>

            <button type="button" className="primaryButton" onClick={printReport}>
              Печать / сохранить PDF
            </button>
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

        .topActions,
        .bottomActions {
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
        textarea {
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
          max-width: 540px;
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

        .finalRow {
          font-size: 24px;
          border-bottom: none;
          color: #0d47a1;
        }

        .printHeader {
          display: none;
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
          .bottomActions {
            justify-content: stretch;
          }

          .primaryButton,
          .secondaryButton {
            width: 100%;
          }

          .infoGrid {
            grid-template-columns: 1fr;
          }

          h1 {
            font-size: 30px;
          }
        }

        @media print {
          .page {
            padding: 0;
            background: white;
          }

          .calculatorCard {
            box-shadow: none;
            border-radius: 0;
            padding: 0;
          }

          .noPrint {
            display: none !important;
          }

          .printHeader {
            display: block;
            margin-bottom: 18px;
          }

          .printHeader h2 {
            font-size: 28px;
            margin-bottom: 4px;
          }

          .block {
            break-inside: avoid;
            border: 1px solid #ddd;
            background: white;
            margin-top: 12px;
            padding: 14px;
          }

          input,
          textarea {
            border: none;
            padding: 0;
            border-radius: 0;
            background: transparent;
          }

          textarea {
            min-height: 60px;
          }

          th,
          td {
            padding: 7px;
          }

          .summaryGrid {
            max-width: 100%;
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
