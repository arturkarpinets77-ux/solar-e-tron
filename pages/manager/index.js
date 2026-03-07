import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import styles from "../../styles/manager.module.css";
import typo from "../../styles/typography.module.css";

export default function ManagerDashboardPage() {
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
        const role = String(data.role || "").trim().toLowerCase();
        const status = String(data.status || "").trim().toLowerCase();

        if (status !== "active") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "director" && role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        const firstName =
          String(data.firstName || "").trim() ||
          String(data.name || "").trim() ||
          "";

        const lastName =
          String(data.lastName || "").trim() ||
          String(data.surname || "").trim() ||
          "";

        setProfile({
          uid: user.uid,
          email: String(data.email || user.email || "").trim(),
          personalNumber: String(data.personalNumber || "").trim(),
          role,
          status,
          firstName,
          lastName,
        });
      } catch (e) {
        setMsg(e?.message || "Ошибка загрузки кабинета");
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

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Загрузка...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.page}>
        <div className={`${styles.card} ${typo.base}`}>Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${typo.base}`}>
        <div className={styles.header}>
          <div>
            <div className={`${styles.title} ${typo.title}`}>
              Кабинет директора
            </div>
            <div className={styles.subtitle}>Solar E-Tron</div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Имя:</span>
            <span className={styles.value}>{profile.firstName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Фамилия:</span>
            <span className={styles.value}>{profile.lastName || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>E-mail:</span>
            <span className={styles.value}>{profile.email || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Личный номер:</span>
            <span className={styles.value}>{profile.personalNumber || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Роль:</span>
            <span className={styles.value}>{profile.role || "-"}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Статус:</span>
            <span className={styles.value}>{profile.status || "-"}</span>
          </div>
        </div>

        <div className={styles.actionsGrid}>
          <Link href="/admin/users" legacyBehavior>
            <a className={styles.actionButton}>Пользователи</a>
          </Link>

          <Link href="/manager/objects" legacyBehavior>
  <a className={styles.actionButton}>Объекты</a>
</Link>

          <button className={styles.actionButton} type="button" disabled>
            Начать рабочий день
          </button>

          <button className={styles.actionButton} type="button" disabled>
            Завершить рабочий день
          </button>
        </div>

        {msg ? <div className={styles.msg}>{msg}</div> : null}

        <div className={styles.footer}>
          <button onClick={handleLogout} className={styles.btnSecondary} type="button">
            Выйти
          </button>

          <Link href="/" className={styles.link}>
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
