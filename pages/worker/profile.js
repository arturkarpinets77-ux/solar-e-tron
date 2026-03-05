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
        <div className={styles.header}>
          <h1 className={styles.title}>Мой профиль</h1>
          <div className={styles.subtitle}>Solar E-Tron</div>
        </div>

        {loading ? (
          <div className={styles.msg}>Загрузка...</div>
        ) : !profile ? (
          <div className={styles.msg}>Профиль не найден</div>
        ) : (
          <>
            <div className={styles.infoBox}>
              <div className={styles.infoGrid}>
                <div className={styles.label}>Имя:</div>
                <div className={styles.value}>{profile.firstName || "-"}</div>

                <div className={styles.label}>Фамилия:</div>
                <div className={styles.value}>{profile.lastName || "-"}</div>

                <div className={styles.label}>E-mail:</div>
                <div className={styles.value}>{profile.email || "-"}</div>

                <div className={styles.label}>Личный номер:</div>
                <div className={styles.value}>{profile.personalNumber || "-"}</div>

                <div className={styles.label}>Роль:</div>
                <div className={styles.value}>{profile.role || "-"}</div>

                <div className={styles.label}>Статус:</div>
                <div className={styles.value}>{profile.status || "-"}</div>
              </div>
            </div>

            {msg ? <div className={styles.msg}>{msg}</div> : null}
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.footer}>
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
