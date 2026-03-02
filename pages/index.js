import Link from "next/link";

export default function HomePage() {
  return (
    <main style={styles.page}>
      <div style={styles.overlay}>
        <div style={styles.center}>
          <Link href="/login" style={styles.btn}>
            Войти
          </Link>

          {/* на будущее можно добавлять кнопки так:
          <Link href="/register" style={{ ...styles.btn, marginTop: 12 }}>
            Регистрация
          </Link>
          */}
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundImage: "url(/bg-solar.jpg)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },

  // затемнение, чтобы элементы читались на фоне
  overlay: {
    minHeight: "100vh",
    background: "rgba(0,0,0,0.10)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },

  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 240,
    height: 64,
    padding: "0 28px",
    borderRadius: 9999,
    background: "#facc15", // жёлтый
    color: "#111827",
    fontWeight: 900,
    fontSize: 22,
    textDecoration: "none",
    boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
    border: "2px solid rgba(255,255,255,0.55)",
    backdropFilter: "blur(2px)",
  },
};
