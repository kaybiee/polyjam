import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Spreadsheet from "./Spreadsheet";
import SpreadsheetSelector, { type SelectedSpreadsheet } from "./SpreadsheetSelector";

function Dispo() {
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SelectedSpreadsheet | null>(
        getSpreadsheetFromUrl
    );
    const [refreshCount, setRefreshCount] = useState(0);
    const spreadsheetUrl = selectedSpreadsheet
        ? `/api/spreadsheets/${selectedSpreadsheet.id}/values?range=${encodeURIComponent("'Dispos'!A:ZZ")}`
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
        window.history.pushState(
            null,
            "",
            `/dispo?file=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`
        );
    }

    function clearSelectedSpreadsheet() {
        const parameters = new URLSearchParams(window.location.search);
        const selectedId = parameters.get("file");
        localStorage.removeItem("polyjam-selected-spreadsheet");
        if (selectedId) {
            sessionStorage.removeItem(`polyjam-token-${selectedId}`);
            sessionStorage.removeItem(`polyjam-token-expires-at-${selectedId}`);
        }
        window.history.replaceState(null, "", "/dispo");
        window.location.reload();
    }

    useEffect(() => {
        function refreshIfSpreadsheetTokenExpired() {
            if (!selectedSpreadsheet) return;
            const expiresAt = Number(sessionStorage.getItem(`polyjam-token-expires-at-${selectedSpreadsheet.id}`));
            if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) clearSelectedSpreadsheet();
        }

        window.addEventListener("focus", refreshIfSpreadsheetTokenExpired);
        return () => window.removeEventListener("focus", refreshIfSpreadsheetTokenExpired);
    }, [selectedSpreadsheet]);

    return (
        <div className="drive-document">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Disponibilités</span></div>
            <div className="document-heading">
                <div>
                    <h1>Disponibilités</h1>
                </div>
                <button className="document-action" type="button" aria-label="Ajouter aux favoris">☆</button>
            </div>

            <SpreadsheetSelector selectedSpreadsheet={selectedSpreadsheet} onFileSelected={selectSpreadsheet} onRefresh={() => setRefreshCount((current) => current + 1)} />

            {selectedSpreadsheet ? (
                <Spreadsheet key={refreshCount} url={spreadsheetUrl} accessToken={selectedSpreadsheet.accessToken} onTokenExpired={clearSelectedSpreadsheet} />
            ) : (
                <p className="picker-notice">Choisissez un fichier Google Drive pour afficher son calendrier.</p>
            )}
        </div>
    );
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