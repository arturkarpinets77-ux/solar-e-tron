import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import {
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [personalNumber, setPersonalNumber] = useState("");
  const [email, setEmail] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => {
    return (
      personalNumber.trim().length > 0 &&
      email.trim().length > 5 &&
      firstName.trim().length > 1 &&
      lastName.trim().length > 1
    );
  }, [personalNumber, email, firstName, lastName]);

  useEffect(() => {
    setMsg("");
  }, [personalNumber, email, firstName, lastName]);

  async function handleRegister(e) {
    e.preventDefault();
    setMsg("");

    const pn = personalNumber.trim();
    const em = email.trim().toLowerCase();
    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!pn || !em || !fn || !ln) {
      setMsg("Заполните личный номер, e-mail, имя и фамилию.");
      return;
    }

    setLoading(true);
    try {
      if (!auth || !db) throw new Error("Firebase не инициализирован.");

      // На регистрации "Запомнить" не нужно: пусть будет сессионно
      await setPersistence(auth, browserSessionPersistence);

      // Пароль = email (как у тебя сейчас). Это небезопасно, но оставляю по твоей логике.
      const cred = await createUserWithEmailAndPassword(auth, em, em);
      const uid = cred.user.uid;

      // Создаём профиль пользователя (ОБЯЗАТЕЛЬНО)
      // status: pending -> пока директор/админ не активирует
      await setDoc(doc(db, "Users", uid), {
        createdAt: serverTimestamp(),
        email: em,
        personalNumber: pn,
        firstName: fn,
        lastName: ln,
        role: "worker",
        status: "pending",
      });

      // После регистрации отправляем на логин
      router.push("/login?registered=1");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        setMsg("Этот e-mail уже зарегистрирован. Используйте вход.");
      } else {
        setMsg(err?.message || "Ошибка регистрации");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Регистрация</h1>
        <div style={styles.sub}>Solar E-Tron</div>

        <form onSubmit={handleRegister} style={{ marginTop: 14 }}>
          <label style={styles.label}>Личный номер</label>
          <input
            style={styles.input}
            value={personalNumber}
            onChange={(e) => setPersonalNumber(e.target.value)}
            placeholder="Например: 1234567"
          />

          <label style={{ ...styles.label, marginTop: 10 }}>E-mail</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />

          <label style={{ ...styles.label, marginTop: 10 }}>Имя (латиницей)</label>
          <input
            style={styles.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Artur"
          />

          <label style={{ ...styles.label, marginTop: 10 }}>Фамилия (латиницей)</label>
          <input
            style={styles.input}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Karpinets"
          />

          <button
            type="submit"
            style={{
              ...styles.btn,
              opacity: canSubmit && !loading ? 1 : 0.6,
              cursor: canSubmit && !loading ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit || loading}
          >
            {loading ? "Создаю..." : "Зарегистрироваться"}
          </button>

          {msg ? <div style={styles.msg}>{msg}</div> : null}

          <div style={{ marginTop: 12 }}>
            <Link href="/login" style={styles.back}>
              ← Вход
            </Link>
            <span style={{ margin: "0 10px" }} />
            <Link href="/" style={styles.back}>
              ← На главную
            </Link>
          </div>

          <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
            После регистрации директор или администратор активируют профиль.
          </div>
        </form>
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
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  h1: { margin: 0, fontSize: 30 },
  sub: { color: "#64748b", marginTop: 4 },
  label: { display: "block", fontWeight: 700, color: "#111827", marginTop: 8 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 16,
  },
  btn: {
    width: "100%",
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
  },
  msg: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "#f1f5f9",
    color: "#0f172a",
  },
  back: { color: "#1e40af", textDecoration: "none", fontWeight: 700 },
};
