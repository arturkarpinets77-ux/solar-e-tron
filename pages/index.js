import Link from "next/link";

export default function HomePage() {
  return (
    <main style={styles.page}>
      <div style={styles.overlay}>
        <div style={styles.content}>
          
          <h1 style={styles.title}>Solar E-Tron</h1>
          <p style={styles.subtitle}>
            Учёт рабочего времени и фотоархив работ
          </p>

          <Link href="/login" style={styles.button}>
            Войти
          </Link>

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

  overlay: {
    minHeight: "100vh",
    background: "linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  content: {
    textAlign: "center",
    color: "white",
    backdropFilter: "blur(2px)",
  },

  title: {
    fontSize: 48,
    fontWeight: 800,
    marginBottom: 10,
    letterSpacing: 1,
  },

  subtitle: {
    fontSize: 18,
    opacity: 0.9,
    marginBottom: 40,
  },

  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 40px",
    borderRadius: 9999,
    background: "#f4c430",   // мягкий золотистый
    color: "#1f2937",
    fontWeight: 700,
    fontSize: 18,
    textDecoration: "none",
    boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
    transition: "all 0.2s ease",
  },
};
