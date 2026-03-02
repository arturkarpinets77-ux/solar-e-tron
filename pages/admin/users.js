import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { auth, db } from "../../lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPending() {
    setMsg("");
    const q = query(collection(db, "Users"), where("status", "==", "pending"));
    const snap = await getDocs(q);
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      const mySnap = await getDoc(doc(db, "Users", u.uid));
      if (!mySnap.exists()) {
        router.push("/login");
        return;
      }
      const myData = mySnap.data();
      const role = String(myData.role || "");
      if (role !== "admin" && role !== "director") {
        router.push("/dashboard");
        return;
      }
      setMe({ uid: u.uid, ...myData });
      await loadPending();
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  async function activate(uid) {
    setMsg("");
    try {
      await updateDoc(doc(db, "Users", uid), { status: "active" });
      await loadPending();
    } catch (e) {
      setMsg(e?.message || "Ошибка обновления");
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Подтверждение пользователей</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/dashboard">← В кабинет</Link>
      </div>

      {msg ? <div style={{ marginBottom: 12, color: "crimson" }}>{msg}</div> : null}

      {users.length === 0 ? (
        <div>Нет пользователей со статусом pending.</div>
      ) : (
        <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
          {users.map((u) => (
            <div key={u.id} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12 }}>
              <div><b>{u.firstName} {u.lastName}</b></div>
              <div>E-mail: {u.email}</div>
              <div>Личный номер: {u.personalNumber}</div>
              <div>Роль: {u.role} | Статус: {u.status}</div>

              <button
                onClick={() => activate(u.id)}
                style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, cursor: "pointer" }}
              >
                Активировать
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
