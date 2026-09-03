import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SpreadsheetSelector, { type SelectedSpreadsheet } from "./SpreadsheetSelector";
import { validateSpreadsheetFormat } from "./spreadsheetFormat";

interface Setlist {
    setlistId: string;
    name: string;
}

function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem("polyjam-google-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function Pratique() {
    const parameters = new URLSearchParams(window.location.search);
    const [date, setDate] = useState(parameters.get("date") ?? formatIsoDate(new Date()));
    const [setlists, setSetlists] = useState<Setlist[]>([]);
    const [selectedSetlistId, setSelectedSetlistId] = useState("");
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SelectedSpreadsheet | null>(getStoredSpreadsheet);
    const [loading, setLoading] = useState(true);
    const [spreadsheetError, setSpreadsheetError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/setlists", { headers: getAuthHeaders() })
            .then((response) => response.ok ? response.json() as Promise<Setlist[]> : [])
            .then(setSetlists)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedSpreadsheet?.accessToken) {
            setSpreadsheetError(null);
            return;
        }

        setSpreadsheetError(null);
        fetch(`/api/spreadsheets/${selectedSpreadsheet.id}/values?range=${encodeURIComponent("'Dispos'!A:ZZ")}`, {
            headers: { Authorization: `Bearer ${selectedSpreadsheet.accessToken}` },
        })
            .then(async (response) => {
                if (response.status === 401) throw new Error("La connexion au fichier Google a expiré.");
                if (!response.ok) throw new Error("Impossible de charger le fichier sélectionné.");
                await validateSpreadsheetFormat(response);
            })
            .catch((error) => setSpreadsheetError(error instanceof Error ? error.message : "Format de fichier invalide."));
    }, [selectedSpreadsheet]);

    function selectSpreadsheet(file: SelectedSpreadsheet) {
        setSelectedSpreadsheet(file);
    }

    return (
        <div className="drive-document pratique-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Pratique</span></div>
            <div className="document-heading"><div><h1>Pratique</h1></div></div>
            <SpreadsheetSelector selectedSpreadsheet={selectedSpreadsheet} onFileSelected={selectSpreadsheet} />
            {spreadsheetError && <p className="status-message error-message">{spreadsheetError}</p>}
            <div className="pratique-form">
                <div>
                    <label htmlFor="practice-date">Date</label>
                    <input id="practice-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </div>
                <div>
                    <label htmlFor="practice-setlist">Setlist</label>
                    <select id="practice-setlist" value={selectedSetlistId} onChange={(event) => setSelectedSetlistId(event.target.value)} disabled={loading}>
                        <option value="">Choisissez une setlist</option>
                        {setlists.map((setlist) => <option key={setlist.setlistId} value={setlist.setlistId}>{setlist.name}</option>)}
                    </select>
                </div>
                <button className="member-save-button" type="button">Générer les horaires</button>
            </div>
            {setlists.length === 0 && !loading && <p className="empty-members">Aucune setlist trouvée.</p>}
        </div>
    );
}

function getStoredSpreadsheet(): SelectedSpreadsheet | null {
    const stored = localStorage.getItem("polyjam-selected-spreadsheet");
    try {
        const parsed = stored ? JSON.parse(stored) as { id?: string; name?: string } : null;
        if (!parsed?.id || !parsed.name) return null;
        return {
            id: parsed.id,
            name: parsed.name,
            accessToken: sessionStorage.getItem(`polyjam-token-${parsed.id}`) || undefined,
        };
    } catch {
        return null;
    }
}

function formatIsoDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default Pratique;
