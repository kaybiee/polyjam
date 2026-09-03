import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Dispo from "./Disponibilites";
import Membres from "./Membres";
import Setlists from "./Setlists";
import Songs from "./Songs";
import Pratique from "./Pratique.tsx";
import PracticeSchedule from "./PracticeSchedule";
import GoogleSignInButton from "./GoogleSignInButton";
import SignInPage from "./SignInPage";
import darkLogo from "./assets/polyjamdarkmode.png";
import lightLogo from "./assets/polyjamlightmode.png";
import { apiFetch } from "./api";

const CREDITS_TEXT = "Site web par Kay Benabdallah, VP Pratique 2026-2027";



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
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    const accessToken = sessionStorage.getItem("polyjam-google-access-token");
    const expiresAt = Number(sessionStorage.getItem("polyjam-google-token-expires-at"));
    if (!accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      sessionStorage.removeItem("polyjam-google-profile");
      sessionStorage.removeItem("polyjam-google-access-token");
      sessionStorage.removeItem("polyjam-google-token-expires-at");
      if (location.pathname !== "/signin") navigate("/signin", { replace: true });
      return;
    }

    const expiryTimer = window.setTimeout(() => {
      sessionStorage.removeItem("polyjam-google-profile");
      sessionStorage.removeItem("polyjam-google-access-token");
      sessionStorage.removeItem("polyjam-google-token-expires-at");
      setGoogleProfile(null);
      navigate("/signin", { replace: true });
    }, expiresAt - Date.now());

    apiFetch("/api/google/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<GoogleProfile>;
      })
      .then((profile) => {
        setGoogleProfile(profile);
        sessionStorage.setItem("polyjam-google-profile", JSON.stringify(profile));
        if (location.pathname === "/signin") navigate("/", { replace: true });
      })
      .catch(() => {
        sessionStorage.removeItem("polyjam-google-profile");
        sessionStorage.removeItem("polyjam-google-access-token");
        sessionStorage.removeItem("polyjam-google-token-expires-at");
        setGoogleProfile(null);
        navigate("/signin", { replace: true });
      })
      return () => window.clearTimeout(expiryTimer);
  }, [location.pathname, navigate]);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("polyjam-theme", nextTheme);
  }

  function signOut() {
    sessionStorage.removeItem("polyjam-google-profile");
    sessionStorage.removeItem("polyjam-google-access-token");
    sessionStorage.removeItem("polyjam-google-token-expires-at");
    setGoogleProfile(null);
    window.location.reload();
  }

  if (!googleProfile || location.pathname === "/signin") {
    return <SignInPage isDark={isDark} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className={`drive-app theme-${theme}`}>
      <header className="logo-area">
        <Link className="drive-brand" to="/">
          <img src={isDark ? darkLogo : lightLogo} alt="Polyjam" />
        </Link>
        <nav className="page-tabs" aria-label="Navigation principale">
          <NavLink to="/" end>Accueil</NavLink>
          <NavLink to="/songs">Chansons</NavLink>
          <NavLink to="/dispo">Disponibilités</NavLink>
          <NavLink to="/membres">Membres</NavLink>
          <NavLink to="/pratique">Pratique</NavLink>
          <NavLink to="/setlists">Setlists</NavLink>
        </nav>
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
              <div className="drive-breadcrumb">Accueil</div>
              <div className="document-heading">
                <div>
                  <h1>Bienvenue à la plateforme Polyjam</h1>
                </div>
              </div>
              <Link className="drive-file-card navigation-card" to="/dispo">
                <span className="file-icon">▤</span>
                <strong>Disponibilités</strong>
              </Link>
              <Link className="drive-file-card navigation-card" to="/songs">
                <span className="file-icon">♪</span>
                <strong>Chansons</strong>
              </Link>
              <Link className="drive-file-card navigation-card" to="/membres">
                <span className="file-icon">♙</span>
                <strong>Membres</strong>
              </Link>
              <Link className="drive-file-card navigation-card" to="/pratique">
                <span className="file-icon">♬</span>
                <strong>Pratique</strong>
              </Link>
              <Link className="drive-file-card navigation-card" to="/setlists">
                <span className="file-icon">♫</span>
                <strong>Setlists</strong>
              </Link>
            </div>
          }
        />
        <Route
          path="/dispo"
          element={<Dispo />}
        />
        <Route path="/membres" element={<Membres />} />
        <Route path="/setlists" element={<Setlists />} />
        <Route path="/songs" element={<Songs />} />
        <Route path="/pratique" element={<Pratique />} />
        <Route path="/pratique/schedule" element={<PracticeSchedule />} />
      </Routes>
        </main>
      </div>
      <footer className="site-footer">{CREDITS_TEXT}</footer>
    </div>
  );
}

type Theme = "light" | "dark";