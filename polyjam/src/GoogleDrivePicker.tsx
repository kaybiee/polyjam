import { useEffect, useState } from "react";

interface GoogleDrivePickerProps {
    onFileSelected: (file: { id: string; name: string; accessToken: string }) => void;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
const driveScope = "https://www.googleapis.com/auth/drive.readonly";

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
        script.onerror = () => reject(new Error("Le script Google n'a pas pu être chargé."));
        document.body.appendChild(script);
    });
}

function GoogleDrivePicker({ onFileSelected }: GoogleDrivePickerProps) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isConfigured = Boolean(clientId && apiKey);

    useEffect(() => {
        if (!isConfigured) return;

        Promise.all([
            loadScript("https://accounts.google.com/gsi/client", "google-identity-script"),
            loadScript("https://apis.google.com/js/api.js", "google-api-script"),
        ])
            .then(() => {
                window.gapi?.load("picker", () => setReady(true));
            })
            .catch(() => {
                setError("Les services Google n'ont pas pu être chargés.");
            });
    }, [isConfigured]);

    function openPicker() {
        if (!window.google || !window.gapi || !clientId || !apiKey) return;

        setError(null);
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: driveScope,
            callback: (response) => {
                const accessToken = response.access_token;
                if (!accessToken) {
                    setError("La connexion Google a échoué.");
                    return;
                }

                const view = new window.google!.picker.DocsView(
                    window.google!.picker.ViewId.SPREADSHEETS
                ).setMimeTypes("application/vnd.google-apps.spreadsheet");

                const picker = new window.google!.picker.PickerBuilder()
                    .addView(view)
                    .setOAuthToken(accessToken)
                    .setDeveloperKey(apiKey)
                    .setCallback((pickerResponse) => {
                        if (
                            pickerResponse.action === window.google!.picker.Action.PICKED &&
                            pickerResponse.docs?.[0]
                        ) {
                            const file = pickerResponse.docs[0];
                            onFileSelected({
                                id: file.id,
                                name: file.name ?? "Sans titre",
                                accessToken,
                            });
                        }
                    })
                    .build();

                picker.setVisible(true);
            },
        });

        tokenClient.requestAccessToken({ prompt: "consent" });
    }

    if (!isConfigured) {
        return (
            <p className="picker-notice">
                Ajoutez <code>VITE_GOOGLE_CLIENT_ID</code> et <code>VITE_GOOGLE_API_KEY</code> dans votre fichier <code>.env.local</code> pour activer la sélection Google Drive.
            </p>
        );
    }

    return (
        <div className="drive-picker">
            <button
                className="drive-picker-button"
                type="button"
                onClick={openPicker}
                disabled={!ready}
            >
                {ready ? "Choisir un fichier Google Drive" : "Connexion aux services Google..."}
            </button>
            {error && <p className="picker-error">{error}</p>}
        </div>
    );
}

export default GoogleDrivePicker;
