import Link from "next/link";

export default function Home() {
  return (
    <div className="hero">
      <div className="glassCard">
        <div className="glassInner">
          <h1 className="title">Solar E-Tron</h1>
          <p className="subtitle">Учёт рабочего времени и фотоархив работ</p>

          <Link className="cta" href="/login">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
