import { useEffect, useState } from "react";

interface GoogleDrivePickerProps {
    onFileSelected: (file: { id: string; name: string; accessToken: string }) => void;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
const googleScopes = [
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
        script.onerror = () => reject(new Error("Le script Google n'a pas pu être chargé."));
        document.body.appendChild(script);
    });
}

function GoogleDrivePicker({ onFileSelected }: GoogleDrivePickerProps) {
    const [ready, setReady] = useState(false);
    const [searching, setSearching] = useState(false);
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

    useEffect(() => {
        if (!ready || !isConfigured || !window.location.search.includes("signin=1")) return;

        window.history.replaceState(null, "", "/dispo");
        openPicker();
    }, [ready, isConfigured]);

    function openPicker() {
        if (!window.google || !window.gapi || !clientId || !apiKey) return;

        setError(null);
        const existingToken = sessionStorage.getItem("polyjam-google-access-token");
        if (existingToken) {
            void showPicker(existingToken);
            return;
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: googleScopes,
            callback: (response) => {
                const accessToken = response.access_token;
                if (!accessToken) {
                    setError("La connexion Google a échoué.");
                    return;
                }
                sessionStorage.setItem("polyjam-google-access-token", accessToken);
                void showPicker(accessToken);
            },
        });

        tokenClient.requestAccessToken({ prompt: "select_account" });
    }

    async function showPicker(accessToken: string) {
        if (!window.google || !apiKey) return;

        setSearching(true);
        try {
            const folders = await findDisposFolders(accessToken);
            if (folders.length === 0) {
                setError('Aucun dossier "Dispos" trouvé dans Google Drive.');
                return;
            }

            let builder = new window.google.picker.PickerBuilder()
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
                });

            folders.forEach((folder, index) => {
                const view = new window.google!.picker.DocsView(
                    window.google!.picker.ViewId.SPREADSHEETS
                )
                    .setMimeTypes("application/vnd.google-apps.spreadsheet")
                    .setParent(folder.id)
                    .setLabel(folders.length > 1 ? `DISPOS ${index + 1}` : "DISPOS");
                builder = builder.addView(view);
            });

            builder.build().setVisible(true);
        } catch {
            setError('Impossible de rechercher les dossiers "Dispos" dans Google Drive.');
        } finally {
            setSearching(false);
        }
    }

    async function findDisposFolders(accessToken: string) {
        const folders: { id: string; name: string }[] = [];
        let pageToken: string | undefined;

        do {
            const parameters = new URLSearchParams({
                key: apiKey!,
                q: "mimeType = 'application/vnd.google-apps.folder' and name contains 'dispos' and trashed = false",
                fields: "nextPageToken,files(id,name)",
                pageSize: "1000",
                corpora: "allDrives",
                includeItemsFromAllDrives: "true",
                supportsAllDrives: "true",
            });
            if (pageToken) parameters.set("pageToken", pageToken);

            const response = await fetch(`https://www.googleapis.com/drive/v3/files?${parameters}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!response.ok) throw new Error("Drive folder search failed");

            const result = await response.json() as {
                files?: { id: string; name?: string }[];
                nextPageToken?: string;
            };
            folders.push(
                ...(result.files ?? []).filter(
                    (folder): folder is { id: string; name: string } =>
                        folder.name?.toLocaleLowerCase() === "dispos"
                )
            );
            pageToken = result.nextPageToken;
        } while (pageToken);

        return folders;
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
                disabled={!ready || searching}
            >
                {searching ? "Recherche du dossier Dispos..." : ready ? "Choisir un fichier Google Drive" : "Connexion aux services Google..."}
            </button>
            {error && <p className="picker-error">{error}</p>}
        </div>
    );
}

export default GoogleDrivePicker;
