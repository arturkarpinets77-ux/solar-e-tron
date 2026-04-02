import { useEffect, useState } from "react";
import styles from "../../styles/manager.module.css";

export default function ObjectsPage() {
  const [objects, setObjects] = useState([]);
  const [msg, setMsg] = useState("");

  async function loadObjects() {
    try {
      const res = await fetch("/api/objects/list");
      const data = await res.json();
      setObjects(data.objects || []);
    } catch (e) {
      setMsg("Ошибка загрузки");
    }
  }

  useEffect(() => {
    loadObjects();
  }, []);

  async function handleDelete(objectId) {
    if (!confirm("Удалить объект полностью?")) return;

    try {
      const res = await fetch("/api/objects/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ objectId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка удаления");
      }

      setMsg("Объект удалён");
      await loadObjects();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className={styles.container}>
      <h1>Объекты</h1>

      {msg && <p>{msg}</p>}

      {objects.map((item) => (
        <div key={item.id} className={styles.card}>
          <h3>{item.name}</h3>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className={styles.btnSecondary}
              onClick={() => handleDelete(item.id)}
              style={{ background: "#ffd6d6", borderColor: "#ffaaaa" }}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
