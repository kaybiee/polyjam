import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SpreadsheetSelector, { type SelectedSpreadsheet } from "./SpreadsheetSelector";
import { generatePracticeCandidates, parseSpreadsheetRows, sortCandidates, type AvailabilityDate, type PracticeCandidate, type PracticeMember, type PracticeSong } from "./practiceScheduling";

interface Setlist { setlistId: string; name: string; songIds: string[]; }

function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem("polyjam-google-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function Pratique() {
    const [date, setDate] = useState(new URLSearchParams(window.location.search).get("date") ?? formatIsoDate(new Date()));
    const [startTime, setStartTime] = useState("18:00");
    const [endTime, setEndTime] = useState("20:00");
    const [forgiveness, setForgiveness] = useState(0);
    const [sortMode, setSortMode] = useState<"nearest" | "songs">("nearest");
    const [setlists, setSetlists] = useState<Setlist[]>([]);
    const [songs, setSongs] = useState<PracticeSong[]>([]);
    const [members, setMembers] = useState<PracticeMember[]>([]);
    const [availabilityDates, setAvailabilityDates] = useState<AvailabilityDate[]>([]);
    const [selectedSetlistId, setSelectedSetlistId] = useState("");
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SelectedSpreadsheet | null>(getSpreadsheetFromUrl);
    const [candidates, setCandidates] = useState<PracticeCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                const requestedSetlist = new URLSearchParams(window.location.search).get("setlist");
                setSelectedSetlistId(requestedSetlist && loadedSetlists.some((item) => item.setlistId === requestedSetlist) ? requestedSetlist : "");
            })
            .catch(() => setError("Impossible de charger les données de pratique."))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedSpreadsheet?.accessToken) {
            return;
        }
        fetch(`/api/spreadsheets/${selectedSpreadsheet.id}/values?range=${encodeURIComponent("'Dispos'!A:ZZ")}`, { headers: { Authorization: `Bearer ${selectedSpreadsheet.accessToken}` } })
            .then(async (response) => {
                if (!response.ok) throw new Error(response.status === 401 ? "La connexion au fichier Google a expiré." : "Impossible de charger le fichier sélectionné.");
                const result = await response.json() as { values?: unknown };
                setAvailabilityDates(parseSpreadsheetRows(result.values as unknown[][]));
            })
            .catch((requestError) => {
                setAvailabilityDates([]);
                setError(requestError instanceof Error ? requestError.message : "Format de fichier invalide.");
            });
    }, [selectedSpreadsheet]);

    const selectedSetlist = setlists.find((setlist) => setlist.setlistId === selectedSetlistId);

    function selectSpreadsheet(file: SelectedSpreadsheet) {
        setSelectedSpreadsheet(file);
        localStorage.setItem("polyjam-selected-spreadsheet", JSON.stringify({ id: file.id, name: file.name }));
        sessionStorage.setItem(`polyjam-token-${file.id}`, file.accessToken ?? "");
        const expiry = sessionStorage.getItem("polyjam-google-token-expires-at");
        if (expiry) sessionStorage.setItem(`polyjam-token-expires-at-${file.id}`, expiry);
    }

    const generate = useCallback(() => {
        setGenerating(true);
        setError(null);
        const selectedSongs = selectedSetlist?.songIds.map((songId) => songs.find((song) => song.songId === songId)).filter((song): song is PracticeSong => Boolean(song)) ?? [];
        const generated = generatePracticeCandidates(availabilityDates, selectedSongs, members, startTime, endTime, 15, forgiveness);
        setCandidates(sortCandidates(generated, sortMode, date));
        setGenerating(false);
    }, [availabilityDates, date, endTime, forgiveness, members, selectedSetlist, songs, sortMode, startTime]);

    useEffect(() => {
        if (!hasGenerated) return;
        const refresh = window.setTimeout(generate, 0);
        return () => window.clearTimeout(refresh);
    }, [generate, hasGenerated]);

    function generateFirstResults() {
        setHasGenerated(true);
        generate();
    }

    function openSchedule(candidate: PracticeCandidate) {
        sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(candidate));
        window.location.href = "/pratique/schedule";
    }

    return (
        <div className="drive-document pratique-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Pratique</span></div>
            <div className="document-heading"><div><h1>Pratique</h1></div></div>
            <SpreadsheetSelector selectedSpreadsheet={selectedSpreadsheet} onFileSelected={selectSpreadsheet} />
            {error && <p className="status-message error-message">{error}</p>}
            <div className="pratique-form">
                <div><label htmlFor="practice-date">Date de référence</label><input id="practice-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
                <div><label htmlFor="practice-setlist">Setlist</label><select id="practice-setlist" value={selectedSetlistId} onChange={(event) => setSelectedSetlistId(event.target.value)} disabled={loading}><option value="">Choisissez une setlist</option>{setlists.map((setlist) => <option key={setlist.setlistId} value={setlist.setlistId}>{setlist.name}</option>)}</select></div>
                <div><label htmlFor="practice-start">Début</label><input id="practice-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
                <div><label htmlFor="practice-end">Fin</label><input id="practice-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
                <div><label htmlFor="practice-forgiveness">Membres absents acceptés</label><input id="practice-forgiveness" type="number" min="0" max="20" value={forgiveness} onChange={(event) => setForgiveness(Number(event.target.value))} /></div>
                <div><label htmlFor="practice-sort">Classer les résultats</label><select id="practice-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as "nearest" | "songs")}><option value="nearest">Plus proches de la date</option><option value="songs">Plus de chansons</option></select></div>
                <button className="member-save-button" type="button" onClick={generateFirstResults} disabled={generating || !selectedSpreadsheet || !selectedSetlist || availabilityDates.length === 0}>{generating ? "Calcul..." : "Suggérer des pratiques"}</button>
            </div>
            {setlists.length === 0 && !loading && <p className="empty-members">Aucune setlist trouvée.</p>}
            {candidates.length > 0 && <PracticeResults candidates={candidates} onSelect={openSchedule} />}
            {hasGenerated && !generating && availabilityDates.length > 0 && selectedSetlist && candidates.length === 0 && <p className="empty-members">Aucune date compatible trouvée avec ces paramètres.</p>}
        </div>
    );
}

function PracticeResults({ candidates, onSelect }: { candidates: PracticeCandidate[]; onSelect: (candidate: PracticeCandidate) => void }) {
    return <section className="practice-results"><h2>Dates proposées</h2>{candidates.map((candidate) => <article className="practice-candidate" key={candidate.date}><div className="practice-candidate-heading"><div><p className="eyebrow">Pratique proposée</p><h3>{formatDisplayDate(candidate.date)}</h3>{candidate.event && <p>{candidate.event}</p>}</div><div><strong>{candidate.fullSongCount} complète{candidate.fullSongCount === 1 ? "" : "s"}</strong><span>{candidate.forgivenSongCount} avec tolérance</span></div></div><PracticeTable title="Chansons" songs={candidate.songs} workload={candidate.staffWorkload} /><button className="primary-action" type="button" onClick={() => onSelect(candidate)}>Choisir cette pratique</button></article>)}</section>;
}

function PracticeTable({ title, songs, workload }: { title: string; songs: PracticeCandidate["songs"]; workload: Record<string, number> }) {
    return <div className="practice-table-wrap"><h3>{title}</h3>{songs.length === 0 ? <p className="empty-members">Aucune chanson</p> : <table className="practice-table"><thead><tr><th>Début</th><th>Durée</th><th>Chanson</th><th>Artiste</th><th>Staff disponible</th><th>Staff absent</th></tr></thead><tbody>{songs.map((song) => <tr key={song.songId}><td>{song.startTime}</td><td>{song.durationMinutes} min</td><td>{song.title}</td><td>{song.artist}</td><td><StaffList names={song.availableStaff} workload={workload} /></td><td>{song.missingStaff.join(", ") || "-"}</td></tr>)}</tbody></table>}</div>;
}

function StaffList({ names, workload }: { names: string[]; workload: Record<string, number> }) {
    return <span className="practice-staff-list">{names.length > 0 ? names.map((name) => <span className={workload[name] === 1 ? "single-song-staff" : "multi-song-staff"} key={name}>{name} ({workload[name]} chanson{workload[name] === 1 ? "" : "s"})</span>) : "Aucun"}</span>;
}

async function fetchCollection<T>(url: string): Promise<T[]> { const response = await fetch(url, { headers: getAuthHeaders() }); if (!response.ok) throw new Error(); const value = await response.json() as unknown; if (!Array.isArray(value)) throw new Error(); return value as T[]; }
function getSpreadsheetFromUrl(): SelectedSpreadsheet | null {
    const parameters = new URLSearchParams(window.location.search);
    const id = parameters.get("file");
    const name = parameters.get("name");
    if (!id || !name) return null;
    return { id, name, accessToken: sessionStorage.getItem(`polyjam-token-${id}`) || undefined };
}
function formatIsoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDisplayDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }

export default Pratique;
