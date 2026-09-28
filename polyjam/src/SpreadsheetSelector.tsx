import GoogleDrivePicker from "./GoogleDrivePicker";

export interface SelectedSpreadsheet {
    id: string;
    name: string;
    accessToken?: string;
}

interface SpreadsheetSelectorProps {
    selectedSpreadsheet: SelectedSpreadsheet | null;
    onFileSelected: (file: SelectedSpreadsheet) => void;
    onRefresh?: () => void;
}

function SpreadsheetSelector({ selectedSpreadsheet, onFileSelected, onRefresh }: SpreadsheetSelectorProps) {
    function selectSpreadsheet(file: SelectedSpreadsheet) {
        localStorage.setItem(
            "polyjam-selected-spreadsheet",
            JSON.stringify({ id: file.id, name: file.name })
        );
        sessionStorage.setItem(`polyjam-token-${file.id}`, file.accessToken ?? "");
        const googleTokenExpiry = sessionStorage.getItem("polyjam-google-token-expires-at");
        if (googleTokenExpiry) sessionStorage.setItem(`polyjam-token-expires-at-${file.id}`, googleTokenExpiry);
        onFileSelected(file);
    }

    return (
        <div className="spreadsheet-selector">
            <div>
                <p className="eyebrow">Fichier sélectionné</p>
                <strong>{selectedSpreadsheet?.name ?? "Aucun fichier sélectionné"}</strong>
            </div>
            {selectedSpreadsheet && onRefresh && <button className="spreadsheet-refresh-button" type="button" onClick={onRefresh} aria-label="Actualiser le fichier" title="Actualiser">↻ Actualiser</button>}
            <GoogleDrivePicker onFileSelected={selectSpreadsheet} />
        </div>
    );
}

export default SpreadsheetSelector;
