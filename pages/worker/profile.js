import Link from "next/link";

export default function WorkerProfile() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ background: "rgba(255,255,255,0.92)", padding: 18, borderRadius: 12 }}>
        Мой профиль (документы и сроки добавим следующим шагом)
        <div style={{ marginTop: 12 }}>
          <Link href="/worker">← Назад</Link>
        </div>
      </div>
    </main>
  );
}
