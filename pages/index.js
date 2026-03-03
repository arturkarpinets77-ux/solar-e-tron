import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  return (
    <div className="page-bg">
      <div className="page-content">
        <div className="glass-card">
          <h1 className="hero-title">Solar E-Tron</h1>
          <p className="hero-subtitle">
            Учёт рабочего времени и фотоархив работ
          </p>

          <button className="hero-btn" onClick={() => router.push("/login")}>
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}
