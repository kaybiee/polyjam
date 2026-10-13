import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SpreadsheetSelector, { type SelectedSpreadsheet } from "./SpreadsheetSelector";
import { apiFetch } from "./api";
import { getSongAttendance, parseSpreadsheetRows, type AvailabilityDate, type PracticeMember, type PracticeSong } from "./practiceScheduling";

interface Setlist {
    setlistId: string;
    name: string;
    songIds: string[];
}

function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem("polyjam-google-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function getToday() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getStoredSpreadsheet(): SelectedSpreadsheet | null {
    try {
        const stored = JSON.parse(localStorage.getItem("polyjam-selected-spreadsheet") ?? "null") as { id?: unknown; name?: unknown } | null;
        if (typeof stored?.id !== "string" || typeof stored.name !== "string") return null;
        return { id: stored.id, name: stored.name, accessToken: sessionStorage.getItem(`polyjam-token-${stored.id}`) || undefined };
    } catch {
        return null;
    }
}

async function fetchCollection<T>(url: string): Promise<T[]> {
    const response = await apiFetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error("Impossible de charger les données de la matrice.");
    const value = await response.json() as unknown;
    if (!Array.isArray(value)) throw new Error("Les données reçues sont invalides.");
    return value as T[];
}

function PracticeMatrix() {
    const [searchParams] = useSearchParams();
    const setlistId = searchParams.get("setlist") ?? "";
    const today = getToday();
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(addDays(today, 7));
    const [startTime, setStartTime] = useState("18:00");
    const [endTime, setEndTime] = useState("20:00");
    const [forgiveness, setForgiveness] = useState("");
    const [setlists, setSetlists] = useState<Setlist[]>([]);
    const [songs, setSongs] = useState<PracticeSong[]>([]);
    const [members, setMembers] = useState<PracticeMember[]>([]);
    const [availabilityDates, setAvailabilityDates] = useState<AvailabilityDate[]>([]);
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SelectedSpreadsheet | null>(getStoredSpreadsheet);
    const [loading, setLoading] = useState(true);
    const [loadedSpreadsheetId, setLoadedSpreadsheetId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetchCollection<Setlist>("/api/setlists"),
            fetchCollection<PracticeSong>("/api/songs"),
            fetchCollection<PracticeMember>("/api/members"),
        ])
            .then(([loadedSetlists, loadedSongs, loadedMembers]) => {
                setSetlists(loadedSetlists);
                setSongs(loadedSongs);
                setMembers(loadedMembers);
            })
            .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Impossible de charger les données."))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedSpreadsheet?.accessToken) {
            return;
        }
        let active = true;
        apiFetch(`/api/spreadsheets/${selectedSpreadsheet.id}/values?range=${encodeURIComponent("'Dispos'!A:ZZ")}`, {
            headers: { Authorization: `Bearer ${selectedSpreadsheet.accessToken}` },
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(response.status === 401 ? "La connexion au fichier Google a expiré." : "Impossible de charger les disponibilités.");
                const result = await response.json() as { values?: unknown };
                if (!Array.isArray(result.values)) throw new Error("Le fichier ne contient pas de disponibilités valides.");
                return parseSpreadsheetRows(result.values as unknown[][]);
            })
            .then((dates) => {
                if (!active) return;
                setAvailabilityDates(dates);
                setLoadedSpreadsheetId(selectedSpreadsheet.id);
            })
            .catch((loadError) => {
                if (!active) return;
                setAvailabilityDates([]);
                setLoadedSpreadsheetId(selectedSpreadsheet.id);
                setError(loadError instanceof Error ? loadError.message : "Impossible de charger les disponibilités.");
            });
        return () => { active = false; };
    }, [selectedSpreadsheet]);

    const selectedSetlist = setlists.find((setlist) => setlist.setlistId === setlistId);
    const setlistSongs = selectedSetlist?.songIds
        .map((songId) => songs.find((song) => song.songId === songId))
        .filter((song): song is PracticeSong => Boolean(song)) ?? [];
    const selectedDates = availabilityDates.filter((date) => date.date >= startDate && date.date <= endDate).sort((left, right) => left.date.localeCompare(right.date));
    const availabilityLoading = Boolean(selectedSpreadsheet?.accessToken && loadedSpreadsheetId !== selectedSpreadsheet.id);
    const validTimeRange = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && startTime < endTime;
    const validDateRange = Boolean(startDate && endDate && startDate <= endDate);
    const explicitForgiveness = forgiveness === "" ? null : Math.max(0, Number(forgiveness));

    function countEligibleSongs(date: AvailabilityDate) {
        if (explicitForgiveness === null) return 0;
        return setlistSongs.filter((song) => {
            const attendance = getSongAttendance(song, members, date, startTime, endTime);
            return song.staffMemberIds.length > 0 && attendance.missingCount <= explicitForgiveness;
        }).length;
    }

    function selectSpreadsheet(file: SelectedSpreadsheet) {
        setSelectedSpreadsheet(file);
        setAvailabilityDates([]);
        setLoadedSpreadsheetId("");
        setError(null);
        localStorage.setItem("polyjam-selected-spreadsheet", JSON.stringify({ id: file.id, name: file.name }));
        sessionStorage.setItem(`polyjam-token-${file.id}`, file.accessToken ?? "");
    }

    function generatorLink(song: PracticeSong, date: AvailabilityDate, missingCount: number) {
        const params = new URLSearchParams({
            date: date.date,
            endDate: date.date,
            setlist: setlistId,
            song: song.songId,
            forgiveness: String(missingCount),
            startTime,
            endTime,
        });
        return `/pratique?${params.toString()}`;
    }

    async function exportMatrix() {
        if (!selectedSetlist || !validDateRange || !validTimeRange || selectedDates.length === 0) return;
        setExportError(null);
        try {
            const XLSX = await import("@e965/xlsx");
            const matrixRows = [
                ["Chanson", ...selectedDates.map((date) => `${formatDate(date.date)}${date.event ? ` - ${date.event}` : ""}${explicitForgiveness !== null ? ` (${countEligibleSongs(date)} chansons)` : ""}`)],
                ...setlistSongs.map((song) => [
                    `${song.title} - ${song.artist}`,
                    ...selectedDates.map((date) => {
                        const attendance = getSongAttendance(song, members, date, startTime, endTime);
                        const allowedMissing = explicitForgiveness ?? Math.floor(attendance.requiredStaffCount / 2);
                        return song.staffMemberIds.length > 0 && attendance.missingCount <= allowedMissing
                            ? attendance.missingCount
                            : "-";
                    }),
                ]),
            ];
            const workbook = XLSX.utils.book_new();
            const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
            matrixSheet["!cols"] = [{ wch: 34 }, ...selectedDates.map(() => ({ wch: 20 }))];
            XLSX.utils.book_append_sheet(workbook, matrixSheet, "Matrice");

            const settingsSheet = XLSX.utils.aoa_to_sheet([
                ["Paramètre", "Valeur"],
                ["Setlist", selectedSetlist.name],
                ["Période", `${startDate} au ${endDate}`],
                ["Heures de pratique", `${startTime} - ${endTime}`],
                ["Absents acceptés", forgiveness === "" ? "Au moins la moitié du staff requis présent" : forgiveness],
            ]);
            settingsSheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
            XLSX.utils.book_append_sheet(workbook, settingsSheet, "Paramètres");

            const safeName = selectedSetlist.name.replace(/[\\/:*?"<>|]/g, "-").trim() || "setlist";
            const fileData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
            const file = new Blob([fileData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const fileUrl = URL.createObjectURL(file);
            const downloadLink = document.createElement("a");
            downloadLink.href = fileUrl;
            downloadLink.download = `matrice-${safeName}-${startDate}-${endDate}.xlsx`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        } catch (exportError) {
            console.error("Failed to export practice matrix", exportError);
            setExportError(exportError instanceof Error
                ? `Impossible de créer le fichier XLSX : ${exportError.message}`
                : "Impossible de créer le fichier XLSX.");
        }
    }

    return (
        <div className="drive-document practice-matrix-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><Link to="/setlists">Setlists</Link><b>›</b><span>Matrice des disponibilités</span></div>
            <div className="document-heading"><div><h1>Matrice des disponibilités</h1><p>{selectedSetlist?.name ?? ""}</p></div><div className="practice-matrix-actions"><button className="member-save-button" type="button" onClick={exportMatrix} disabled={!selectedSetlist || !validDateRange || !validTimeRange || selectedDates.length === 0}>Exporter XLSX</button><Link className="member-save-button" to="/setlists">Retour aux setlists</Link></div></div>
            {exportError && <p className="status-message error-message" role="alert">{exportError}</p>}
            <SpreadsheetSelector selectedSpreadsheet={selectedSpreadsheet} onFileSelected={selectSpreadsheet} />
            {error && <p className="status-message error-message" role="alert">{error}</p>}
            <div className="practice-matrix-controls">
                <div><label htmlFor="matrix-start-date">Du</label><input id="matrix-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
                <div><label htmlFor="matrix-end-date">Au</label><input id="matrix-end-date" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
                <div><label htmlFor="matrix-start-time">Début de pratique</label><input id="matrix-start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
                <div><label htmlFor="matrix-end-time">Fin de pratique</label><input id="matrix-end-time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
                <div><label htmlFor="matrix-forgiveness">Absents acceptés</label><input id="matrix-forgiveness" type="number" min="0" max="20" step="1" value={forgiveness} onChange={(event) => setForgiveness(event.target.value)} placeholder="Au moins la moitié présente" /></div>
            </div>
            {loading && <p className="status-message">Chargement de la matrice...</p>}
            {!loading && !selectedSetlist && <p className="empty-members">Cette setlist est introuvable. Retournez aux setlists et ouvrez la matrice depuis une liste.</p>}
            {!loading && selectedSetlist && !selectedSpreadsheet && <p className="empty-members">Choisissez un fichier Google Drive pour afficher les disponibilités.</p>}
            {!loading && selectedSetlist && selectedSpreadsheet && !selectedSpreadsheet.accessToken && <p className="empty-members">La connexion au fichier Google a expiré. Sélectionnez-le à nouveau pour continuer.</p>}
            {!loading && selectedSpreadsheet && availabilityLoading && <p className="status-message">Chargement des disponibilités...</p>}
            {!loading && selectedSpreadsheet && !availabilityLoading && !error && !validDateRange && <p className="members-error">La date de début doit être avant ou égale à la date de fin.</p>}
            {!loading && selectedSpreadsheet && !availabilityLoading && !error && validDateRange && !validTimeRange && <p className="members-error">L'heure de début doit être avant l'heure de fin.</p>}
            {!loading && selectedSpreadsheet && !availabilityLoading && !error && validDateRange && validTimeRange && selectedDates.length === 0 && <p className="empty-members">Aucune disponibilité dans cette période.</p>}
            {!loading && selectedSpreadsheet && !availabilityLoading && !error && validDateRange && validTimeRange && selectedDates.length > 0 && (
                <div className="practice-matrix-scroll" role="region" aria-label="Matrice des chansons et disponibilités" tabIndex={0}>
                    <table className="practice-matrix-table">
                        <thead><tr><th scope="col">Chanson</th>{selectedDates.map((date) => <th scope="col" key={date.date}>{formatDate(date.date)}{date.event && <small>{date.event}</small>}{explicitForgiveness !== null && <small className="practice-matrix-day-total">{countEligibleSongs(date)} chanson{countEligibleSongs(date) === 1 ? "" : "s"}</small>}</th>)}</tr></thead>
                        <tbody>{setlistSongs.map((song) => <tr key={song.songId}>
                            <th scope="row"><span>{song.title}</span><small>{song.artist}</small></th>
                            {selectedDates.map((date) => {
                                const attendance = getSongAttendance(song, members, date, startTime, endTime);
                                const allowedMissing = explicitForgiveness ?? Math.floor(attendance.requiredStaffCount / 2);
                                const canSchedule = song.staffMemberIds.length > 0 && attendance.missingCount <= allowedMissing;
                                return <td key={date.date}>
                                    {canSchedule
                                        ? <Link className="practice-matrix-count" to={generatorLink(song, date, attendance.missingCount)} title={attendance.missingStaff.length ? `Absents : ${attendance.missingStaff.map((person) => `${person.name} (${person.instrument})`).join(", ")}` : "Tout le staff requis est disponible"} aria-label={`${attendance.missingCount} absent${attendance.missingCount === 1 ? "" : "s"} pour ${song.title}, ${formatDate(date.date)}`}>{attendance.missingCount}</Link>
                                        : <span className="practice-matrix-unavailable" title={attendance.requiredStaffCount === 0 ? "Aucun rôle obligatoire assigné" : `Plus de ${allowedMissing} absence${allowedMissing === 1 ? "" : "s"}`}>-</span>}
                                </td>;
                            })}
                        </tr>)}</tbody>
                    </table>
                </div>
            )}
            {!loading && selectedSetlist && setlistSongs.length === 0 && <p className="empty-members">Cette setlist ne contient aucune chanson.</p>}
        </div>
    );
}

function formatDate(value: string) {
    return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export default PracticeMatrix;
