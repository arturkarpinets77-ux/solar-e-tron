import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebaseClient";

export default function Register() {
  const [personalNumber, setPersonalNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("");

    try {
      // 1. Создаём пользователя в Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const uid = userCredential.user.uid;

      // 2. Записываем профиль в Firestore
      await setDoc(doc(db, "users", uid), {
        personalNumber,
        fullName,
        email,
        role: "worker", // по умолчанию
        createdAt: serverTimestamp(),
      });

      setStatus("Регистрация успешна.");
    } catch (err) {
      setStatus("Ошибка регистрации: " + err.message);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>Регистрация</h2>

        <form onSubmit={onSubmit}>
          <label>Личный номер</label>
          <input
            value={personalNumber}
            onChange={(e) => setPersonalNumber(e.target.value)}
            required
          />

          <label>Имя и фамилия (латиницей)</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">Зарегистрироваться</button>
        </form>

        {status && <div style={{ marginTop: 10 }}>{status}</div>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f5f6f8",
  },
  card: {
    width: 400,
    padding: 30,
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
};
