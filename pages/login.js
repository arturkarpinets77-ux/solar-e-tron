// pages/login.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../lib/firebaseClient";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const LS_REMEMBER = "rememberMe";
const LS_PN = "rememberPersonalNumber";
const LS_EMAIL = "rememberEmail";

export default function LoginPage() {
  const router = useRouter();

  const [personalNumber, setPersonalNumber] = useState("");
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => {
    return personalNumber.trim().length > 0 && email.trim().length > 3;
  }, [personalNumber, email]);

  useEffect(() => {
    setMsg("");
  }, [personalNumber, email, remember]);

  // 1) При открытии /login: подставляем сохранённые поля (если remember=true)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const r = localStorage.getItem(LS_REMEMBER);
    const isRemember = r === null ? true : r === "1";
    setRemember(isRemember);

    if (isRemember) {
      setPersonalNumber(localStorage.getItem(LS_PN) || "");
      setEmail(localStorage.getItem(LS_EMAIL) || "");
    }
  }, []);

  // 2) При изменениях: сохраняем/очищаем localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    localStorage.setItem(LS_REMEMBER, remember ? "1" : "0");

    if (remember) {
      localStorage.setItem(LS_PN, personalNumber);
      localStorage.setItem(LS_EMAIL, email);
    } else {
      // если сняли галочку — сразу очищаем сохранённые поля
      localStorage.removeItem(LS_PN);
      localStorage.removeItem(LS_EMAIL);
    }
  }, [remember, personalNumber, email]);

  useEffect(() => {
    if (router.query.registered === "1") {
      setMsg("Регистрация выполнена. Ожидайте активации директором/админом.");
    }
  }, [router.query.registered]);

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");

    const pn = personalNumber.trim();
    const em = email.trim().toLowerCase();

    if (!pn || !em) {
      setMsg("Заполните личный номер и e-mail.");
      return;
    }

    setLoading(true);
    try {
      if (!auth || !db) throw new Error("Firebase не инициализирован.");

      // Firebase Auth persistence (логин-сессия)
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );

      // Пароль = email (как у тебя)
      const cred = await signInWithEmailAndPassword(auth, em, em);

      const uid = cred.user.uid;
      const snap = await getDoc(doc(db, "Users", uid));

      if (!snap.exists()) {
        await signOut(auth);
        throw new Error("Пользователь не зарегистрирован. Нажмите «Регистрация».");
      }

      const data = snap.data() || {};
      const dbEmail = String(data.email || "").trim().toLowerCase();
      const dbPN = String(data.personalNumber || "").trim();
      const status = String(data.status || "").trim().toLowerCase();

      if (dbEmail !== em || dbPN !== pn) {
        await signOut(auth);
        throw new Error("Неверный личный номер или e-mail.");
      }

      if (status !== "active") {
        await signOut(auth);
        throw new Error("Профиль ещё не активирован директором/админом.");
      }

      // Если remember=false — НЕ храним поля (но сессия будет до закрытия браузера)
      if (typeof window !== "undefined" && !remember) {
        localStorage.removeItem(LS_PN);
        localStorage.removeItem(LS_EMAIL);
      }

      router.push("/dashboard");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        setMsg("Пользователь не зарегистрирован. Нажмите «Регистрация».");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setMsg("Неверный личный номер или e-mail.");
      } else {
        setMsg(err?.message || "Ошибка входа");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Вход</h1>
        <div style={styles.sub}>Solar E-Tron</div>

        <form onSubmit={handleLogin} style={{ marginTop: 14 }}>
          <label style={styles.label}>Личный номер</label>
          <input
            style={styles.input}
            placeholder="Например: 1234567"
            value={personalNumber}
            onChange={(e) => setPersonalNumber(e.target.value)}
          />

          <label style={{ ...styles.label, marginTop: 10 }}>E-mail</label>
          <input
            style={styles.input}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Запомнить меня</span>
          </label>

          <button
            type="submit"
            style={{
              ...styles.btn,
              opacity: canSubmit && !loading ? 1 : 0.6,
              cursor: canSubmit && !loading ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit || loading}
          >
            {loading ? "Вход..." : "Войти"}
          </button>

          {msg ? <div style={styles.msg}>{msg}</div> : null}

          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <Link href="/register" style={styles.back}>
              Регистрация
            </Link>
            <Link href="/" style={styles.back}>
              ← На главную
            </Link>
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
  checkboxRow: { display: "flex", alignItems: "center", marginTop: 10, color: "#111827" },
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
