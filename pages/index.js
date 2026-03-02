import Link from "next/link";

export default function HomePage() {
  // В будущем просто добавляешь сюда новые кнопки
  const buttons = [
    { label: "Войти", href: "/login", variant: "primary" },
    // пример на будущее:
    // { label: "Регистрация", href: "/register", variant: "secondary" },
  ];

  return (
    <main className="home">
      <div className="overlay">
        <div className="center">
          <div className="btnStack">
            {buttons.map((b) => (
              <Link
                key={b.href}
                href={b.href}
                className={`btn ${b.variant === "primary" ? "btnPrimary" : "btnSecondary"}`}
              >
                {b.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .home {
          min-height: 100vh;
          /* ФОНОВАЯ КАРТИНКА */
          background-image: url("/bg-solar.jpg");
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          position: relative;
        }

        /* чуть затемняем, чтобы кнопка читалась */
        .overlay {
          min-height: 100vh;
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.05),
            rgba(0, 0, 0, 0.18)
          );
          display: flex;
        }

        .center {
          margin: auto;
          padding: 24px;
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .btnStack {
          display: flex;
          flex-direction: column;
          gap: 14px;
          align-items: center;
        }

        .btn {
          width: min(360px, 86vw);
          text-align: center;
          padding: 14px 18px;
          border-radius: 999px;
          font-weight: 800;
          text-decoration: none;
          user-select: none;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
          transition: transform 0.08s ease, filter 0.08s ease;
        }

        .btn:hover {
          filter: brightness(1.03);
          transform: translateY(-1px);
        }

        .btn:active {
          transform: translateY(0px);
        }

        /* Жёлтая кнопка как на картинке */
        .btnPrimary {
          background: #f2b233;
          color: #1a1a1a;
        }

        /* Если добавишь вторую кнопку */
        .btnSecondary {
          background: rgba(255, 255, 255, 0.92);
          color: #111827;
        }
      `}</style>
    </main>
  );
}
