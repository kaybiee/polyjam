export async function validateSpreadsheetFormat(response: Response) {
    const result = await response.clone().json() as { values?: unknown };
    if (!Array.isArray(result.values)) {
        throw new Error("Le fichier ne respecte pas le format attendu : les données doivent être organisées en lignes.");
    }

    const rows = result.values as unknown[][];
    const headerRow = rows[4];
    if (!Array.isArray(headerRow)) {
        throw new Error("Le fichier ne respecte pas le format attendu : la ligne 5 doit contenir les noms des personnes.");
    }

    const personColumns = headerRow.slice(2).filter((value) => String(value).trim() !== "");
    if (personColumns.length === 0) {
        throw new Error("Le fichier ne respecte pas le format attendu : aucun nom de personne n'a été trouvé à partir de la colonne C.");
    }

    const hasValidDate = rows.slice(5).some((row) => Array.isArray(row) && Boolean(parseSpreadsheetDate(row[0])));
    if (!hasValidDate) {
        throw new Error("Le fichier ne respecte pas le format attendu : aucune date valide n'a été trouvée à partir de la ligne 6.");
    }

    return rows;
}

function parseSpreadsheetDate(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "string") return false;
    const trimmedValue = value.trim();
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmedValue)) return true;
    return !Number.isNaN(new Date(trimmedValue).getTime());
}
