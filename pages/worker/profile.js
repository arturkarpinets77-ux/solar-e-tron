import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import styles from "../../styles/worker.module.css";

export default function WorkerProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      setMsg("");

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "Users", user.uid));
        if (!snap.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const data = snap.data() || {};

        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        setProfile({
          firstName,
          lastName,
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role: String(data.role || "").trim(),
          status: String(data.status || "").trim(),
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      setMsg(e?.message || "Ошибка выхода");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Мой профиль</h1>
        <div className={styles.subtitle}>Solar E-Tron</div>

        {loading ? (
          <div className={styles.note}>Загрузка...</div>
        ) : !profile ? (
          <div className={styles.note}>Профиль не найден</div>
        ) : (
          <>
            <div className={styles.profileBox}>
              <div className={styles.row}>
                <span className={styles.label}>Имя:</span>
                <span className={styles.value}>{profile.firstName || "-"}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Фамилия:</span>
                <span className={styles.value}>{profile.lastName || "-"}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>E-mail:</span>
                <span className={styles.value}>{profile.email || "-"}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Личный номер:</span>
                <span className={styles.value}>{profile.personalNumber || "-"}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Роль:</span>
                <span className={styles.value}>{profile.role || "-"}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Статус:</span>
                <span className={styles.value}>{profile.status || "-"}</span>
              </div>
            </div>

            {msg ? <div className={styles.msg}>{msg}</div> : null}
          </>
        )}

        <div className={styles.actions}>
          <button onClick={handleLogout} className={styles.btnSecondary}>
            Выйти
          </button>
          <Link href="/worker" className={styles.link}>
            ← Назад
          </Link>
          <Link href="/" className={styles.link}>
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
