import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface GoogleSignInButtonProps {
    onConnected: (profile: GoogleProfile) => void;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const scopes = [
    "openid",
    "profile",
    "email",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ");

function loadScript(src: string, id: string) {
    return new Promise<void>((resolve, reject) => {
        const existingScript = document.getElementById(id);
        if (existingScript) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Les services Google n'ont pas pu être chargés."));
        document.body.appendChild(script);
    });
}

function GoogleSignInButton({ onConnected }: GoogleSignInButtonProps) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!clientId) return;

        loadScript("https://accounts.google.com/gsi/client", "google-identity-script")
            .then(() => setReady(true))
            .catch(() => setError("Les services Google n'ont pas pu être chargés."));
    }, []);

    function signIn() {
        if (!window.google || !clientId) return;

        setError(null);
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: scopes,
            callback: async (response) => {
                if (!response.access_token) {
                    setError("La connexion Google a échoué.");
                    return;
                }

                try {
                    const profileResponse = await apiFetch("/api/google/profile", {
                        headers: { Authorization: `Bearer ${response.access_token}` },
                    });
                    if (profileResponse.status === 403) {
                        setError("Ce compte Google n'est pas autorisé.");
                        return;
                    }
                    if (!profileResponse.ok) {
                        const details = await profileResponse.json().catch(() => null) as { error?: unknown } | null;
                        setError(typeof details?.error === "string" ? details.error : "Le serveur Polyjam n'a pas pu valider la connexion.");
                        return;
                    }
                    const profile = await profileResponse.json() as GoogleProfile;
                    sessionStorage.setItem("polyjam-google-access-token", response.access_token);
                    const expiresIn = response.expires_in ?? 3600;
                    sessionStorage.setItem("polyjam-google-token-expires-at", String(Date.now() + expiresIn * 1000));
                    sessionStorage.setItem("polyjam-google-profile", JSON.stringify(profile));
                    onConnected(profile);
                    window.location.assign(import.meta.env.BASE_URL);
                } catch (signInError) {
                    setError(signInError instanceof TypeError
                        ? "Le serveur Polyjam est inaccessible. Vérifiez que l'API est démarrée et que la base de données est joignable."
                        : signInError instanceof Error
                            ? signInError.message
                            : "La réponse du serveur Polyjam est invalide.");
                }
            },
        });

        tokenClient.requestAccessToken({ prompt: "select_account" });
    }

    return (
        <div className="google-sign-in-wrap">
            <button className="google-sign-in" type="button" onClick={signIn} disabled={!ready}>
                {ready ? "Se connecter avec Google" : "Connexion Google..."}
            </button>
            {error && <span className="picker-error google-sign-in-error" role="alert" aria-live="assertive">{error}</span>}
        </div>
    );
}

export default GoogleSignInButton;
