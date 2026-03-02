import Link from "next/link";

export default function Home() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.badge}>Рабочая тестовая версия • App Hosting ✅</div>

        <h1 style={styles.h1}>
          Учёт рабочего времени и фотоархив работ{" "}
          <span style={{ color: "#2563eb" }}>в одном приложении</span>
        </h1>

        <p style={styles.p}>
          Отметка прихода/обеда/ухода, отчёты для бухгалтера и директора, контроль
          прав доступа и фотоархив выполненных работ.
        </p>

        <div style={styles.row}>
          <Link href="/login" style={styles.primaryBtn}>
            Войти
          </Link>

          <a
            href="#features"
            style={styles.secondaryBtn}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Посмотреть функции
          </a>
        </div>

        <div id="features" style={{ marginTop: 24 }}>
          <h3 style={styles.h3}>Ключевые функции</h3>
          <ul style={styles.ul}>
            <li>Работник: Приход / Обед / Уход + фото работ</li>
            <li>Бухгалтер: просмотр часов и отчёт за месяц</li>
            <li>Директор/Админ: управление доступами и контроль отметок</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 24,
    background: "#f5f7fb",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "100%",
    maxWidth: 920,
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#1e40af",
    fontSize: 12,
    marginBottom: 12,
  },
  h1: { margin: "6px 0 10px", fontSize: 34, lineHeight: 1.15 },
  p: { margin: "0 0 16px", color: "#475569" },
  row: { display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" },
  primaryBtn: {
    display: "inline-block",
    background: "#1d4ed8",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
  },
  secondaryBtn: {
    display: "inline-block",
    background: "#eef2ff",
    color: "#1e40af",
    padding: "12px 16px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
  },
  h3: { margin: "0 0 8px" },
  ul: { margin: 0, paddingLeft: 18, color: "#334155" },
};
