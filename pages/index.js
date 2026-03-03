import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  return (
    <main className="landing">
      <div className="glassCard">
        <h1 className="brandTitle">Solar E-Tron</h1>
        <p className="brandSubtitle">Учёт рабочего времени и фотоархив работ</p>

        <button className="primaryBtn" onClick={() => router.push("/login")}>
          Войти
        </button>
      </div>
    </main>
  );
}
