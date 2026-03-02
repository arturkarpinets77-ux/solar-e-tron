import { useState } from "react";

export default function Login() {
  const [personalNumber, setPersonalNumber] = useState("");
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();

    const pn = personalNumber.trim();
    const em = email.trim();

    if (!pn) return setStatus("Введите личный номер.");
    if (!em) return setStatus("Введите e-mail.");

    // Пока тест: сохраняем локально только если включено "Запомнить меня"
    if (remember) {
      localStorage.setItem("auth_personalNumber", pn);
      localStorage.setItem("auth_email", em);
      localStorage.setItem("auth_remember", "1");
    } else {
      localStorage.removeItem("auth_personalNumber");
      localStorage.removeItem("auth_email");
      localStorage.removeItem("auth_remember");
    }

    setStatus("Готово. Дальше подключим реальную авторизацию.");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.title}>Вход</div>
          <div style={styles.subTitle}>Solar E-Tron</div>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>Личный номер</label>
          <input
            value={personalNumber}
            onChange={(e) => setPersonalNumber(e.target.value)}
            placeholder="Например: 1234567"
            style={styles.input}
            inputMode="numeric"
            autoComplete="username"
          />

          <label style={styles.label}>E-mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            style={styles.input}
            type="email"
            autoComplete="email"
          />

          <label style={styles.rememberRow}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span style={styles.rememberText}>Запомнить меня</span>
          </label>

          <button type="submit" style={styles.button}>
            Войти
          </button>

          {status ? <div style={styles.status}>{status}</div> : null}

          <div style={styles.backRow}>
            <a href="/" style={styles.link}>
              ← На главную
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "#f6f7fb",
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  header: {
    padding: "18px 18px 12px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    background: "linear-gradient(180deg, #ffffff 0%, #fbfbff 100%)",
  },
  title: { fontSize: 22, fontWeight: 700 },
  subTitle: { marginTop: 4, color: "#6b7280", fontSize: 13 },
  form: { padding: 18, display: "grid", gap: 10 },
  label: { fontSize: 13, color: "#374151", fontWeight: 600 },
  input: {
    padding: "11px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    outline: "none",
    fontSize: 14,
  },
  rememberRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    userSelect: "none",
  },
  rememberText: { fontSize: 14, color: "#111827" },
  button: {
    marginTop: 8,
    padding: "12px 12px",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  status: {
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#f3f4f6",
    color: "#111827",
    fontSize: 13,
  },
  backRow: { marginTop: 2 },
  link: { color: "#2563eb", textDecoration: "none", fontSize: 14 },
};
