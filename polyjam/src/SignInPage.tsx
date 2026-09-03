import GoogleSignInButton from "./GoogleSignInButton";
import darkLogo from "./assets/polyjamdarkmode.png";
import lightLogo from "./assets/polyjamlightmode.png";

interface SignInPageProps {
    isDark: boolean;
    onToggleTheme: () => void;
}

function SignInPage({ isDark, onToggleTheme }: SignInPageProps) {
    return (
        <div className={`signin-page theme-${isDark ? "dark" : "light"}`}>
            <header className="signin-header">
                <img src={isDark ? darkLogo : lightLogo} alt="Polyjam" />
                <button
                    className="theme-toggle theme-logo"
                    type="button"
                    onClick={onToggleTheme}
                    aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
                    aria-pressed={isDark}
                >
                    <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
                </button>
            </header>
            <main className="signin-content">
                <img className="signin-logo" src={isDark ? darkLogo : lightLogo} alt="Polyjam" />
                <h1>Connexion requise</h1>
                <p>Connectez-vous avec un compte Google autorisé pour accéder à la plateforme.</p>
                <GoogleSignInButton onConnected={() => undefined} />
            </main>
        </div>
    );
}

export default SignInPage;
