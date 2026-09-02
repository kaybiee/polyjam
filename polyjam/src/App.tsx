import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import Dispo from "./Disponibilites";
import darkLogo from "./assets/polyjamdarkmode.png";
import lightLogo from "./assets/polyjamlightmode.png";




export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("polyjam-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const isDark = theme === "dark";

  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("polyjam-theme", nextTheme);
  }

  return (
    <div className={`drive-app theme-${theme}`}>
      <header className="logo-area">
        <Link className="drive-brand" to="/">
          <img src={isDark ? darkLogo : lightLogo} alt="Polyjam" />
        </Link>
        <button
          className="theme-toggle theme-logo"
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
          aria-pressed={isDark}
        >
          <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
        </button>
      </header>
      <div className="drive-layout">
        <main className="drive-main">
      <Routes>
        <Route
          path="/"
          element={
            <div className="drive-home">
              <p className="drive-breadcrumb">Accueil</p>
              <Link className="drive-file-card navigation-card" to="/dispo">
                <span className="file-icon">▤</span>
                <strong>Disponibilités</strong>
              </Link>
            </div>
          }
        />
        <Route path="/dispo" element={<Dispo />} />
      </Routes>
        </main>
      </div>
    </div>
  );
}

type Theme = "light" | "dark";