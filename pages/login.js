import { useState } from "react";

export default function Login() {
  const [valtti, setValtti] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Вход в систему</h2>

        <label style={styles.label}>Личный номер</label>
        <input
          style={styles.input}
          value={valtti}
          onChange={(e) => setValtti(e.target.value)}
          placeholder="Введите личный номер"
        />

        <label style={styles.label}>E-mail</label>
        <input
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Введите e-mail"
        />

        <button
          style={styles.button}
          onClick={() => alert("Пока тестовый вход (без базы данных)")}
        >
          Войти
        </button>

        <div style={styles.bottomText}>
          Нет аккаунта?{" "}
          <a href="/register" style={styles.link}>
            Регистрация
          </a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #eef3fb, #f9fbff)",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: 360,
    padding: 30,
    borderRadius: 16,
    background: "#ffffff",
    boxShadow: "0 20px 50px rgba(0,0,0,0.1)",
  },
  title: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 10,
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 5,
    borderRadius: 8,
    border: "1px solid #ddd",
  },
  button: {
    marginTop: 20,
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: 0,
    fontWeight: 700,
    background: "#0a6cff",
    color: "#fff",
    cursor: "pointer",
  },
  bottomText: {
    marginTop: 15,
    fontSize: 14,
  },
  link: {
    color: "#0a6cff",
    fontWeight: 600,
  },
};
