import { useEffect, useEffectEvent, useState } from "react";

interface GoogleDrivePickerProps {
    onFileSelected: (file: { id: string; name: string; accessToken: string }) => void;
}

interface GoogleDriveFile {
    id: string;
    name: string;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const googleScopes = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ");

function loadIdentityScript() {
    return new Promise<void>((resolve, reject) => {
        const scriptId = "google-identity-script";
        const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
        if (existingScript) {
            if (window.google) resolve();
            else existingScript.addEventListener("load", () => resolve(), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Le script Google n'a pas pu être chargé."));
        document.body.appendChild(script);
    });
}

async function fetchDriveFiles(accessToken: string, query: string): Promise<GoogleDriveFile[]> {
    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined;

    do {
        const parameters = new URLSearchParams({
            q: query,
            fields: "nextPageToken,files(id,name)",
            pageSize: "1000",
            orderBy: "name",
            corpora: "allDrives",
            includeItemsFromAllDrives: "true",
            supportsAllDrives: "true",
        });
        if (pageToken) parameters.set("pageToken", pageToken);

        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${parameters}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await response.json() as {
            files?: GoogleDriveFile[];
            nextPageToken?: string;
            error?: { message?: string };
        };
        if (!response.ok) {
            throw new Error(result.error?.message ?? "Impossible de récupérer les fichiers Google Drive.");
        }

        files.push(...(result.files ?? []));
        pageToken = result.nextPageToken;
    } while (pageToken);

    return files;
}

function GoogleDrivePicker({ onFileSelected }: GoogleDrivePickerProps) {
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState<GoogleDriveFile[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const isConfigured = Boolean(clientId);

    useEffect(() => {
        if (!isConfigured) return;

        loadIdentityScript()
            .then(() => setReady(true))
            .catch(() => setError("Les services Google n'ont pas pu être chargés."));
    }, [isConfigured]);

    const loadSpreadsheetsFromEffect = useEffectEvent(loadSpreadsheets);

    useEffect(() => {
        if (!ready || !window.location.search.includes("signin=1")) return;
        window.history.replaceState(null, "", "/dispo");
        loadSpreadsheetsFromEffect();
    }, [ready]);

    function loadSpreadsheets() {
        if (!window.google || !clientId) return;

        setError(null);
        const existingToken = sessionStorage.getItem("polyjam-google-access-token");
        if (existingToken) {
            void findSpreadsheets(existingToken);
            return;
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: googleScopes,
            callback: (response) => {
                if (!response.access_token) {
                    setError("La connexion Google a échoué.");
                    return;
                }
                sessionStorage.setItem("polyjam-google-access-token", response.access_token);
                void findSpreadsheets(response.access_token);
            },
        });

        tokenClient.requestAccessToken({ prompt: "select_account" });
    }

    async function findSpreadsheets(accessToken: string) {
        setLoading(true);
        setFiles([]);
        setSelectedId("");
        try {
            const folders = await fetchDriveFiles(
                accessToken,
                "mimeType = 'application/vnd.google-apps.folder' and name contains 'dispos' and trashed = false"
            );
            const disposFolders = folders.filter((folder) => folder.name.toLocaleLowerCase() === "dispos");
            if (disposFolders.length === 0) {
                setError('Aucun dossier "Dispos" trouvé dans Google Drive.');
                return;
            }

            const spreadsheetsByFolder = await Promise.all(disposFolders.map((folder) =>
                fetchDriveFiles(
                    accessToken,
                    `mimeType = 'application/vnd.google-apps.spreadsheet' and '${folder.id}' in parents and trashed = false`
                )
            ));
            const uniqueFiles = new Map<string, GoogleDriveFile>();
            spreadsheetsByFolder.flat().forEach((file) => uniqueFiles.set(file.id, file));
            const foundFiles = [...uniqueFiles.values()];
            setFiles(foundFiles);
            if (foundFiles.length === 0) {
                setError('Aucun Google Sheets trouvé dans les dossiers "Dispos".');
            }
        } catch (requestError) {
            setError(requestError instanceof Error
                ? requestError.message
                : 'Impossible de rechercher les dossiers "Dispos" dans Google Drive.');
        } finally {
            setLoading(false);
        }
    }

    function selectSpreadsheet(fileId: string) {
        setSelectedId(fileId);
        const file = files.find((item) => item.id === fileId);
        const accessToken = sessionStorage.getItem("polyjam-google-access-token");
        if (file && accessToken) onFileSelected({ ...file, accessToken });
    }

    if (!isConfigured) {
        return (
            <p className="picker-notice">
                Ajoutez <code>VITE_GOOGLE_CLIENT_ID</code> dans votre fichier <code>.env.local</code> pour activer la sélection Google Drive.
            </p>
        );
    }

    return (
        <div className="drive-picker">
            <button
                className="drive-picker-button"
                type="button"
                onClick={loadSpreadsheets}
                disabled={!ready || loading}
            >
                {loading ? 'Recherche dans les dossiers "Dispos"...' : ready ? "Charger les fichiers Google Sheets" : "Connexion aux services Google..."}
            </button>
            {files.length > 0 && (
                <select
                    className="spreadsheet-file-select"
                    value={selectedId}
                    onChange={(event) => selectSpreadsheet(event.target.value)}
                    aria-label="Choisir un fichier Google Sheets"
                >
                    <option value="">Sélectionnez un fichier</option>
                    {files.map((file) => (
                        <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                </select>
            )}
            {error && <p className="picker-error">{error}</p>}
        </div>
    );
}

export default GoogleDrivePicker;
