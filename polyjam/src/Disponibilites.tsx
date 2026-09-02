import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleDrivePicker from "./GoogleDrivePicker";
import Spreadsheet from "./Spreadsheet";

interface SelectedSpreadsheet {
    id: string;
    name: string;
    accessToken?: string;
}

function Dispo() {
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SelectedSpreadsheet | null>(
        getStoredSpreadsheet
    );
    const spreadsheetUrl = selectedSpreadsheet?.accessToken
        ? `https://www.googleapis.com/drive/v3/files/${selectedSpreadsheet.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
        : selectedSpreadsheet
            ? `https://docs.google.com/spreadsheets/d/${selectedSpreadsheet.id}/export?format=xlsx`
            : "";

    useEffect(() => {
        function restoreFromHistory() {
            setSelectedSpreadsheet(getSpreadsheetFromUrl());
        }

        window.addEventListener("popstate", restoreFromHistory);
        return () => window.removeEventListener("popstate", restoreFromHistory);
    }, []);

    function selectSpreadsheet(file: SelectedSpreadsheet) {
        setSelectedSpreadsheet(file);
        localStorage.setItem(
            "polyjam-selected-spreadsheet",
            JSON.stringify({ id: file.id, name: file.name })
        );
        sessionStorage.setItem(`polyjam-token-${file.id}`, file.accessToken ?? "");
        window.history.pushState(
            null,
            "",
            `/dispo?file=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`
        );
    }

    return (
        <div className="drive-document">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Disponibilités</span></div>
            <div className="document-heading">
                <div>
                    <p className="eyebrow">Calendrier partagé</p>
                    <h1>Disponibilités 2026-2027</h1>
                </div>
                <button className="document-action" type="button" aria-label="Ajouter aux favoris">☆</button>
            </div>

            <div className="spreadsheet-selector">
                <div>
                    <p className="eyebrow">Source actuelle</p>
                    <strong>{selectedSpreadsheet?.name ?? "Aucun fichier sélectionné"}</strong>
                </div>
                <GoogleDrivePicker onFileSelected={selectSpreadsheet} />
            </div>

            {selectedSpreadsheet ? (
                <Spreadsheet url={spreadsheetUrl} accessToken={selectedSpreadsheet.accessToken} />
            ) : (
                <p className="picker-notice">Choisissez un fichier Google Drive pour afficher son calendrier.</p>
            )}
        </div>
    );
}

function getStoredSpreadsheet(): SelectedSpreadsheet | null {
    const parameters = new URLSearchParams(window.location.search);
    const stored = localStorage.getItem("polyjam-selected-spreadsheet");

    try {
        const parsed = stored ? JSON.parse(stored) as { id?: string; name?: string } : null;
        const id = parameters.get("file") ?? parsed?.id;
        const name = parameters.get("name") ?? parsed?.name;
        if (!id || !name) return null;

        return {
            id,
            name,
            accessToken: sessionStorage.getItem(`polyjam-token-${id}`) || undefined,
        };
    } catch {
        return null;
    }
}

function getSpreadsheetFromUrl(): SelectedSpreadsheet | null {
    const parameters = new URLSearchParams(window.location.search);
    const id = parameters.get("file");
    const name = parameters.get("name");
    if (!id || !name) return null;

    return {
        id,
        name,
        accessToken: sessionStorage.getItem(`polyjam-token-${id}`) || undefined,
    };
}

export default Dispo;