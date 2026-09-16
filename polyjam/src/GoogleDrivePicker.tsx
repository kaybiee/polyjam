import { useEffect, useState } from "react";

interface GoogleDrivePickerProps {
    onFileSelected: (file: { id: string; name: string; accessToken: string }) => void;
}

interface GoogleDriveFile {
    id: string;
    name?: string;
}

function GoogleDrivePicker({ onFileSelected }: GoogleDrivePickerProps) {
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState<GoogleDriveFile[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const accessToken = sessionStorage.getItem("polyjam-google-access-token");
        if (!accessToken) {
            setError("La connexion Google est requise pour afficher le dossier DISPOS.");
            return;
        }

        setLoading(true);
        Promise.all([
            fetchDriveFiles(accessToken, "name = 'DISPOS' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"),
        ])
            .then(([folders]) => {
                const folderId = folders[0]?.id;
                if (!folderId) throw new Error("Le dossier DISPOS est introuvable dans Google Drive.");
                return fetchDriveFiles(accessToken, `name != '' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed = false`);
            })
            .then(setFiles)
            .catch((requestError) => {
                setFiles([]);
                setError(requestError instanceof Error ? requestError.message : "Impossible de récupérer les fichiers du dossier DISPOS.");
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="drive-picker">
            {loading && <p className="picker-notice">Recherche des fichiers dans le dossier DISPOS...</p>}
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
            {!loading && files.length === 0 && error === null && <p className="picker-notice">Aucun fichier Google Sheets trouvé dans le dossier DISPOS.</p>}
            {error && <p className="picker-error">{error}</p>}
        </div>
    );
}

async function fetchDriveFiles(accessToken: string, query: string): Promise<GoogleDriveFile[]> {
    const parameters = new URLSearchParams({
        spaces: "drive",
        pageSize: "100",
        orderBy: "name",
        q: query,
        fields: "files(id,name)",
    });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${parameters}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await response.json() as { files?: GoogleDriveFile[]; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? "Impossible de récupérer les fichiers Google Drive.");
    return result.files ?? [];
}

export default GoogleDrivePicker;
