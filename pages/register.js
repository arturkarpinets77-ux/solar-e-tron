import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => {
    return (
      firstName.trim().length >= 2 &&
      lastName.trim().length >= 2 &&
      personalNumber.trim().length >= 3 &&
      email.trim().length >= 5
    );
  }, [firstName, lastName, personalNumber, email]);

  async function handleRegister(e) {
    e.preventDefault();
    setMsg("");

    const fn = firstName.trim();
    const ln = lastName.trim();
    const pn = personalNumber.trim();
    const em = email.trim().toLowerCase();

    setLoading(true);
    try {
      // Пароль = email (как у тебя сейчас)
      const cred = await createUserWithEmailAndPassword(auth, em, em);
      const uid = cred.user.uid;

      // Создаем профиль только при явной регистрации
      await setDoc(doc(db, "Users", uid), {
        email: em,
        personalNumber: pn,
        firstName: fn,
        lastName: ln,
        role: "worker",
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Можно разлогинить сразу и показать "ожидайте подтверждения"
      await signOut(auth);

      router.push("/login?registered=1");
    } catch (err) {
      setMsg(err?.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Регистрация</h1>
        <div style={styles.sub}>После регистрации директор или администратор активируют аккаунт.</div>

        <form onSubmit={handleRegister} style={{ marginTop: 14 }}>
          <label style={styles.label}>Имя</label>
          <input style={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />

          <label style={styles.label}>Фамилия</label>
          <input style={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} />

          <label style={styles.label}>Личный номер</label>
          <input style={styles.input} value={personalNumber} onChange={(e) => setPersonalNumber(e.target.value)} />

          <label style={styles.label}>E-mail</label>
          <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />

          <button
            type="submit"
            style={{ ...styles.btn, opacity: canSubmit && !loading ? 1 : 0.6 }}
            disabled={!canSubmit || loading}
          >
            {loading ? "Создание..." : "Зарегистрироваться"}
          </button>

          {msg ? <div style={styles.msg}>{msg}</div> : null}

          <div style={{ marginTop: 12 }}>
            <Link href="/login" style={styles.back}>← Назад к входу</Link>
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
    background: "#f5f7fb",
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
  sub: { color: "#64748b", marginTop: 6, lineHeight: 1.4 },
  label: { display: "block", fontWeight: 700, color: "#111827", marginTop: 10 },
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
    cursor: "pointer",
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
