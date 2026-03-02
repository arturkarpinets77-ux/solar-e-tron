export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.bg} />
      <div style={styles.overlay} />

      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logo}>SE</div>
          <div>
            <div style={styles.brandTitle}>Solar E-Tron</div>
            <div style={styles.brandSub}>App Hosting (Firebase) • Web</div>
          </div>
        </div>

        <div style={styles.headerActions}>
          <a style={styles.link} href="#features">Функции</a>
          <a style={styles.link} href="#about">О проекте</a>
          <a style={styles.primaryBtn} href="#cta">Войти</a>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <div style={styles.heroLeft}>
            <div style={styles.badge}>Рабочая тестовая версия • App Hosting ✅</div>
            <h1 style={styles.h1}>
              Учёт рабочего времени и фотоархив работ
              <span style={styles.h1Accent}> в одном приложении</span>
            </h1>
            <p style={styles.p}>
              Отметка прихода/обеда/ухода, отчёты для бухгалтера и директора, контроль прав доступа,
              и фотоархив выполненных работ.
            </p>

            <div style={styles.ctaRow} id="cta">
              <button
                style={styles.ctaBtn}
                onClick={() => alert("Пока тестовая страница. Экран входа подключим следующим шагом.")}
              >
                Войти
              </button>
              <a style={styles.secondaryBtn} href="#features">
                Посмотреть функции
              </a>
            </div>

            <div style={styles.statsRow}>
              <div style={styles.statCard}>
                <div style={styles.statNum}>3</div>
                <div style={styles.statText}>роли доступа</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statNum}>24/7</div>
                <div style={styles.statText}>доступ к отчётам</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statNum}>Фото</div>
                <div style={styles.statText}>архив работ</div>
              </div>
            </div>
          </div>

          <div style={styles.heroRight}>
            <div style={styles.mockCard}>
              <div style={styles.mockTop}>
                <div style={styles.dot} />
                <div style={styles.dot} />
                <div style={styles.dot} />
              </div>
              <div style={styles.mockBody}>
                <div style={styles.mockTitle}>Сегодня</div>
                <div style={styles.mockLine} />
                <div style={styles.mockGrid}>
                  <div style={styles.mockTile}>
                    <div style={styles.mockTileTitle}>Приход</div>
                    <div style={styles.mockTileValue}>07:58</div>
                  </div>
                  <div style={styles.mockTile}>
                    <div style={styles.mockTileTitle}>Обед</div>
                    <div style={styles.mockTileValue}>12:03</div>
                  </div>
                  <div style={styles.mockTile}>
                    <div style={styles.mockTileTitle}>Уход</div>
                    <div style={styles.mockTileValue}>16:31</div>
                  </div>
                  <div style={styles.mockTile}>
                    <div style={styles.mockTileTitle}>Фото</div>
                    <div style={styles.mockTileValue}>+3</div>
                  </div>
                </div>

                <div style={styles.mockHint}>
                  Дальше подключим реальные экраны: вход, регистрация, отчёты, фотоархив.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" style={styles.section}>
          <h2 style={styles.h2}>Ключевые функции</h2>
          <div style={styles.cards}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Работник</div>
              <ul style={styles.ul}>
                <li>Приход / Обед / Уход</li>
                <li>Фото выполненных работ</li>
                <li>Простая авторизация</li>
              </ul>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Бухгалтер</div>
              <ul style={styles.ul}>
                <li>Просмотр часов сотрудников</li>
                <li>Отчёт за месяц (общее время)</li>
                <li>Экспорт без геолокации</li>
              </ul>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Директор / Админ</div>
              <ul style={styles.ul}>
                <li>Все функции бухгалтера</li>
                <li>Управление доступами</li>
                <li>Контроль отметок и данных</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="about" style={styles.section}>
          <h2 style={styles.h2}>О проекте</h2>
          <div style={styles.about}>
            <div style={styles.aboutText}>
              Solar E-Tron — веб-страница проекта и точка входа. Дальше мы подключим реальную логику:
              авторизацию, роли, отображение отчётов, фотоархив и админ-панель.
            </div>
            <div style={styles.aboutBox}>
              <div style={styles.aboutBoxTitle}>Следующий шаг</div>
              <div style={styles.aboutBoxText}>
                Сделаем страницу “Вход” и “Регистрация” (пока можно без базы, просто дизайн).
              </div>
            </div>
          </div>
        </section>

        <footer style={styles.footer}>
          <div style={styles.footerLine} />
          <div style={styles.footerText}>
            © {new Date().getFullYear()} Solar E-Tron • Firebase App Hosting
          </div>
        </footer>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    color: "#0b1220",
    position: "relative",
    overflow: "hidden",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif',
  },
  bg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(0, 180, 255, 0.25), transparent 60%)," +
      "radial-gradient(900px 500px at 80% 20%, rgba(255, 200, 0, 0.25), transparent 60%)," +
      "radial-gradient(900px 700px at 50% 90%, rgba(0, 255, 150, 0.18), transparent 60%)," +
      "linear-gradient(180deg, #f7f9fc 0%, #eef3fb 45%, #f9fbff 100%)",
    filter: "saturate(1.05)",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0.8) 100%)",
    backdropFilter: "blur(2px)",
  },
  header: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 22px",
    maxWidth: 1100,
    margin: "0 auto",
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    letterSpacing: 0.5,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 10px 30px rgba(11,18,32,0.08)",
  },
  brandTitle: { fontSize: 16, fontWeight: 800 },
  brandSub: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  headerActions: { display: "flex", alignItems: "center", gap: 14 },
  link: { textDecoration: "none", color: "rgba(11,18,32,0.75)", fontWeight: 600 },
  primaryBtn: {
    textDecoration: "none",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    color: "#ffffff",
    background: "#0b1220",
    boxShadow: "0 10px 28px rgba(11,18,32,0.18)",
  },

  main: { position: "relative", zIndex: 2 },
  hero: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "30px 22px 10px",
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 22,
    alignItems: "center",
  },
  heroLeft: {},
  badge: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 10px 30px rgba(11,18,32,0.06)",
  },
  h1: { margin: "16px 0 10px", fontSize: 44, lineHeight: 1.05, letterSpacing: -0.5 },
  h1Accent: { color: "#0a6cff" },
  p: { margin: 0, fontSize: 16, lineHeight: 1.6, opacity: 0.8, maxWidth: 560 },

  ctaRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 18 },
  ctaBtn: {
    border: 0,
    cursor: "pointer",
    padding: "12px 16px",
    borderRadius: 14,
    fontWeight: 900,
    color: "#fff",
    background: "#0a6cff",
    boxShadow: "0 12px 32px rgba(10,108,255,0.22)",
  },
  secondaryBtn: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 14,
    fontWeight: 800,
    color: "#0b1220",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(11,18,32,0.08)",
  },

  statsRow: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  statCard: {
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 10px 28px rgba(11,18,32,0.06)",
    minWidth: 120,
  },
  statNum: { fontSize: 22, fontWeight: 900 },
  statText: { fontSize: 12, opacity: 0.75, marginTop: 2 },

  heroRight: { display: "flex", justifyContent: "flex-end" },
  mockCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    background: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 18px 50px rgba(11,18,32,0.10)",
    overflow: "hidden",
  },
  mockTop: { display: "flex", gap: 8, padding: 12, borderBottom: "1px solid rgba(11,18,32,0.06)" },
  dot: { width: 10, height: 10, borderRadius: 99, background: "rgba(11,18,32,0.18)" },
  mockBody: { padding: 16 },
  mockTitle: { fontWeight: 900, fontSize: 14, opacity: 0.75 },
  mockLine: { height: 10, borderRadius: 999, background: "rgba(11,18,32,0.08)", marginTop: 10 },
  mockGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  mockTile: {
    borderRadius: 16,
    padding: 12,
    background: "rgba(11,18,32,0.04)",
    border: "1px solid rgba(11,18,32,0.06)",
  },
  mockTileTitle: { fontSize: 12, opacity: 0.7, fontWeight: 800 },
  mockTileValue: { marginTop: 6, fontSize: 18, fontWeight: 900 },
  mockHint: { marginTop: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.5 },

  section: { maxWidth: 1100, margin: "0 auto", padding: "26px 22px" },
  h2: { margin: "0 0 14px", fontSize: 22, letterSpacing: -0.2 },
  cards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  card: {
    borderRadius: 18,
    background: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 14px 40px rgba(11,18,32,0.08)",
    padding: 16,
  },
  cardTitle: { fontWeight: 900, marginBottom: 10 },
  ul: { margin: 0, paddingLeft: 16, opacity: 0.8, lineHeight: 1.7 },

  about: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 12,
    alignItems: "start",
  },
  aboutText: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(11,18,32,0.08)",
    boxShadow: "0 14px 40px rgba(11,18,32,0.08)",
    lineHeight: 1.7,
    opacity: 0.85,
  },
  aboutBox: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(10,108,255,0.10)",
    border: "1px solid rgba(10,108,255,0.18)",
  },
  aboutBoxTitle: { fontWeight: 900, marginBottom: 8 },
  aboutBoxText: { opacity: 0.8, lineHeight: 1.6 },

  footer: { maxWidth: 1100, margin: "0 auto", padding: "18px 22px 40px" },
  footerLine: { height: 1, background: "rgba(11,18,32,0.10)" },
  footerText: { marginTop: 12, fontSize: 12, opacity: 0.7 },
};
