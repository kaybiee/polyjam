import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import Dispo from "./Disponibilites";
import Membres from "./Membres";
import GoogleSignInButton from "./GoogleSignInButton";
import darkLogo from "./assets/polyjamdarkmode.png";
import lightLogo from "./assets/polyjamlightmode.png";




export default function App() {
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(() => {
    const storedProfile = sessionStorage.getItem("polyjam-google-profile");
    try {
      return storedProfile ? JSON.parse(storedProfile) as GoogleProfile : null;
    } catch {
      return null;
    }
  });
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

  function signOut() {
    sessionStorage.removeItem("polyjam-google-profile");
    sessionStorage.removeItem("polyjam-google-access-token");
    setGoogleProfile(null);
    window.location.reload();
  }

  return (
    <div className={`drive-app theme-${theme}`}>
      <header className="logo-area">
        <Link className="drive-brand" to="/">
          <img src={isDark ? darkLogo : lightLogo} alt="Polyjam" />
        </Link>
        {googleProfile ? (
          <div className="google-profile" title={googleProfile.email}>
            {googleProfile.picture ? (
              <img src={googleProfile.picture} alt="" />
            ) : (
              <span>{(googleProfile.name ?? googleProfile.email ?? "G").charAt(0).toUpperCase()}</span>
            )}
            <strong>{googleProfile.name ?? googleProfile.email}</strong>
            <button className="google-sign-out" type="button" onClick={signOut}>
              Déconnexion
            </button>
          </div>
        ) : (
          <GoogleSignInButton
            onConnected={(profile) => setGoogleProfile(profile)}
          />
        )}
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
              <Link className="drive-file-card navigation-card" to="/membres">
                <span className="file-icon">♙</span>
                <strong>Membres</strong>
              </Link>
            </div>
          }
        />
        <Route
          path="/dispo"
          element={<Dispo />}
        />
        <Route path="/membres" element={<Membres />} />
      </Routes>
        </main>
      </div>
    </div>
  );
}

type Theme = "light" | "dark";