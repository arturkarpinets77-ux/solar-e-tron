import Link from "next/link";

export default function Home() {
  return (
    <div className="hero">
      <div className="glass-card">
        <h1>Solar E-Tron</h1>
        <p>Учёт рабочего времени и фотоархив работ</p>

        <Link href="/login">
          <button className="login-btn">Войти</button>
        </Link>
      </div>
    </div>
  );
}
