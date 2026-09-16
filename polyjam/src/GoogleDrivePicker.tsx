import { useCallback, useEffect, useState } from "react";

interface GoogleDrivePickerProps {
    onFileSelected: (file: { id: string; name: string; accessToken: string }) => void;
}

interface GoogleDriveFile {
    id: string;
    name?: string;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
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
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState<GoogleDriveFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const requestFiles = useCallback((accessToken: string) => {
        setLoading(true);
        setError(null);
        const parameters = new URLSearchParams({
            spaces: "drive",
            pageSize: "100",
            orderBy: "name",
            q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
            fields: "files(id,name)",
        });

        fetch(`https://www.googleapis.com/drive/v3/files?${parameters}`, { headers: { Authorization: `Bearer ${accessToken}` } })
            .then(async (response) => {
                const result = await response.json() as { files?: GoogleDriveFile[]; error?: { message?: string } };
                if (!response.ok) throw new Error(result.error?.message ?? "Impossible de récupérer les fichiers Google Drive.");
                setFiles(result.files ?? []);
            })
            .catch((requestError) => {
                setFiles([]);
                setError(requestError instanceof Error ? requestError.message : "Impossible de récupérer les fichiers Google Drive.");
            })
            .finally(() => setLoading(false));
    }, []);

    const openPicker = useCallback(() => {
        if (!window.google || !clientId) return;
        setError(null);
        const existingToken = sessionStorage.getItem("polyjam-google-access-token");
        if (existingToken) {
            requestFiles(existingToken);
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
                sessionStorage.setItem("polyjam-google-token-expires-at", String(Date.now() + (response.expires_in ?? 3600) * 1000));
                requestFiles(accessToken);
            },
        });
        tokenClient.requestAccessToken({ prompt: "select_account" });
    }, [requestFiles]);

    useEffect(() => {
        if (!clientId) return;
        loadScript("https://accounts.google.com/gsi/client", "google-identity-script")
            .then(() => setReady(true))
            .catch(() => setError("Le service Google n'a pas pu être chargé."));
    }, []);

    if (!clientId) return <p className="picker-notice">Ajoutez <code>VITE_GOOGLE_CLIENT_ID</code> dans votre configuration pour activer la sélection Google Drive.</p>;

    return (
        <div className="drive-picker">
            <button className="drive-picker-button" type="button" onClick={openPicker} disabled={!ready || loading}>
                {loading ? "Recherche des fichiers..." : ready ? "Choisir un fichier Google Drive" : "Connexion Google..."}
            </button>
            {files.length > 0 && (
                <select className="spreadsheet-file-select" defaultValue="" onChange={(event) => {
                    const file = files.find((item) => item.id === event.target.value);
                    const accessToken = sessionStorage.getItem("polyjam-google-access-token");
                    if (file && accessToken) onFileSelected({ id: file.id, name: file.name ?? "Sans titre", accessToken });
                }}>
                    <option value="">Sélectionnez un fichier</option>
                    {files.map((file) => <option key={file.id} value={file.id}>{file.name ?? "Sans titre"}</option>)}
                </select>
            )}
            {!loading && ready && files.length === 0 && error === null && <p className="picker-notice">Aucun fichier Google Sheets trouvé.</p>}
            {error && <p className="picker-error">{error}</p>}
        </div>
    );
}

export default GoogleDrivePicker;
