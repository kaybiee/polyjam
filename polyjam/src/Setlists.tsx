import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import SongModal, { type SongDraft } from "./SongModal";
import { apiFetch } from "./api";

interface Member {
    memberId: string;
    name: string;
    actif: boolean;
    mainInstrument?: string;
}

interface Song {
    songId: string;
    title: string;
    artist: string;
    staffMemberIds: string[];
    staffInstruments: Record<string, string>;
}

interface Setlist {
    setlistId: string;
    name: string;
    songIds: string[];
}

function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem("polyjam-google-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function Setlists() {
    const [setlists, setSetlists] = useState<Setlist[]>([]);
    const [songs, setSongs] = useState<Song[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [editingSong, setEditingSong] = useState<Song | null>(null);
    const [isSongModalOpen, setIsSongModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.allSettled([
            fetchCollection<Setlist>("/api/setlists"),
            fetchCollection<Member>("/api/members"),
            fetchCollection<Song>("/api/songs"),
        ])
            .then(([setlistsResult, membersResult, songsResult]) => {
                if (setlistsResult.status === "fulfilled") {
                    const normalizedSetlists = setlistsResult.value.map(normalizeSetlist);
                    setSetlists(normalizedSetlists);
                    if (normalizedSetlists[0]) selectSetlist(normalizedSetlists[0]);
                } else {
                    setError("Impossible de charger les listes.");
                }
                if (membersResult.status === "fulfilled") setMembers(membersResult.value);
                if (songsResult.status === "fulfilled") setSongs(songsResult.value.map(normalizeSong));
            })
            .finally(() => setLoading(false));
    }, []);

    const selectedSetlist = setlists.find((setlist) => setlist.setlistId === selectedId) ?? null;

    function selectSetlist(setlist: Setlist) {
        setSelectedId(setlist.setlistId);
        setName(setlist.name);
    }

    function startNewSetlist() {
        setSelectedId(null);
        setName("");
        setEditingSong(null);
        setIsSongModalOpen(false);
    }

    async function saveSetlist(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        const setlistId = selectedSetlist?.setlistId ?? crypto.randomUUID();
        const songIds = selectedSetlist?.songIds ?? [];
        try {
            const response = await apiFetch(`/api/setlists/${setlistId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify({ name: name.trim(), songIds }),
            });
            if (!response.ok) {
                const details = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(details?.error ?? "Impossible d'enregistrer la liste.");
            }
            const saved = normalizeSetlist(await response.json() as Setlist);
            setSetlists((current) => [...current.filter((item) => item.setlistId !== saved.setlistId), saved].sort((left, right) => left.name.localeCompare(right.name)));
            setSelectedId(saved.setlistId);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Impossible d'enregistrer la liste.");
        } finally {
            setSaving(false);
        }
    }

    async function addSong({ title, artist, staffMemberIds, staffInstruments }: SongDraft, existingSongId?: string) {
        if (!selectedSetlist) return;
        if (existingSongId) {
            await saveSetlistData({ ...selectedSetlist, songIds: [...selectedSetlist.songIds, existingSongId] });
            setIsSongModalOpen(false);
            return;
        }
        if (!title || !artist || staffMemberIds.length === 0) return;
        const song = { songId: editingSong?.songId ?? crypto.randomUUID(), title, artist, staffMemberIds, staffInstruments };
        try {
            const songResponse = await apiFetch(`/api/songs/${song.songId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify(song),
            });
            if (!songResponse.ok) throw new Error();
            const savedSong = await songResponse.json() as Song;
            setSongs((current) => [...current.filter((item) => item.songId !== savedSong.songId), savedSong]);
            if (!editingSong) await saveSetlistData({ ...selectedSetlist, songIds: [...selectedSetlist.songIds, savedSong.songId] });
        } catch {
            setError("Impossible d'enregistrer la chanson.");
            return;
        }
        setIsSongModalOpen(false);
        setEditingSong(null);
    }

    async function removeSong(songId: string) {
        if (!selectedSetlist) return;
        await saveSetlistData({ ...selectedSetlist, songIds: selectedSetlist.songIds.filter((id) => id !== songId) });
    }

    async function saveSetlistData(setlist: Setlist) {
        setError(null);
        try {
            const response = await apiFetch(`/api/setlists/${setlist.setlistId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify(setlist),
            });
            if (!response.ok) throw new Error();
            const saved = await response.json() as Setlist;
            setSetlists((current) => current.map((item) => item.setlistId === saved.setlistId ? saved : item));
        } catch {
            setError("Impossible d'enregistrer la chanson.");
        }
    }

    async function deleteSetlist() {
        if (!selectedSetlist || !window.confirm(`Supprimer la liste ${selectedSetlist.name} ?`)) return;
        await apiFetch(`/api/setlists/${selectedSetlist.setlistId}`, { method: "DELETE", headers: getAuthHeaders() });
        setSetlists((current) => current.filter((item) => item.setlistId !== selectedSetlist.setlistId));
        startNewSetlist();
    }

    function memberName(memberId: string) {
        return members.find((member) => member.memberId === memberId)?.name ?? "Membre introuvable";
    }

    function memberNames(memberIds: string[], staffInstruments: Record<string, string>) {
        return [...memberIds]
            .sort((leftId, rightId) => {
                const leftName = memberName(leftId);
                const rightName = memberName(rightId);
                const leftFirstName = leftName.trim().split(/\s+/)[0] ?? "";
                const rightFirstName = rightName.trim().split(/\s+/)[0] ?? "";
                return leftFirstName.localeCompare(rightFirstName, "fr") || leftName.localeCompare(rightName, "fr");
            })
            .map((memberId) => `${memberName(memberId)} (${staffInstruments[memberId] ?? members.find((member) => member.memberId === memberId)?.mainInstrument ?? "Instrument non défini"})`)
            .join(", ");
    }

    return (
        <div className="drive-document setlists-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Setlists</span></div>
            <div className="document-heading"><div><h1>Setlists</h1></div></div>
            {error && <p className="members-error">{error}</p>}
            {loading ? <p className="status-message">Chargement des setlists...</p> : (
                <div className="setlists-layout">
                    <aside className="setlists-sidebar">
                        <button className="member-add-button" type="button" onClick={startNewSetlist}>＋ Nouvelle setlist</button>
                        {setlists.length > 0 ? setlists.map((setlist) => <button className={`setlist-list-item${selectedId === setlist.setlistId ? " selected" : ""}`} type="button" key={setlist.setlistId} onClick={() => selectSetlist(setlist)}>{setlist.name}</button>) : <p className="empty-members">Aucune liste trouvée.</p>}
                    </aside>
                    <section className="setlist-editor">
                        <form className="setlist-name-form" onSubmit={saveSetlist}>
                            <label htmlFor="setlist-name">Nom de la setlist</label>
                            <input id="setlist-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Nom de la setlist" required />
                            <button className="member-save-button" type="submit" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
                            {selectedSetlist && <button className="member-delete-button" type="button" onClick={deleteSetlist} aria-label="Supprimer la setlist" title="Supprimer">🗑</button>}
                        </form>
                        {selectedSetlist ? <>
                            <h2>Chansons</h2>
                            <div className="setlist-songs">
                                <div className="song-list-header" aria-hidden="true"><span>Titre</span><span>Artiste</span><span>Staff</span><span></span></div>
                                {selectedSetlist.songIds.map((songId) => songs.find((song) => song.songId === songId)).filter((song): song is Song => Boolean(song)).map((song) => <div className="setlist-song" key={song.songId}><strong>{song.title}</strong><span>{song.artist}</span><span>{memberNames(song.staffMemberIds, song.staffInstruments)}</span><div className="song-card-actions"><button className="member-edit-button" type="button" onClick={() => { setEditingSong(song); setIsSongModalOpen(true); }} aria-label={`Modifier ${song.title}`} title="Modifier">✎</button><button className="member-delete-button" type="button" onClick={() => removeSong(song.songId)} aria-label={`Supprimer ${song.title}`} title="Supprimer">×</button></div></div>)}
                                {selectedSetlist.songIds.length === 0 && <p className="empty-members">Aucune chanson dans cette setlist.</p>}
                            </div>
                            <button className="member-add-button song-add-button" type="button" onClick={() => { setEditingSong(null); setIsSongModalOpen(true); }}>＋ Ajouter une chanson</button>
                            {isSongModalOpen && <SongModal
                                key={editingSong?.songId ?? "new"}
                                members={members}
                                existingSongs={editingSong ? [] : songs.filter((song) => !selectedSetlist.songIds.includes(song.songId))}
                                initialSong={editingSong ?? undefined}
                                isEditing={Boolean(editingSong)}
                                onClose={() => { setEditingSong(null); setIsSongModalOpen(false); }}
                                onSubmit={addSong}
                            />}
                        </> : <p className="empty-members">Créez une setlist pour commencer.</p>}
                    </section>
                </div>
            )}
        </div>
    );
}

async function fetchCollection<T>(url: string): Promise<T[]> {
    const response = await apiFetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const collection = await response.json() as unknown;
    if (!Array.isArray(collection)) throw new Error("Expected a collection");
    return collection as T[];
}

function normalizeSong(song: Song & { artistMemberId?: string; staffMemberId?: string }): Song {
    return {
        songId: song.songId,
        title: song.title,
        artist: song.artist ?? song.artistMemberId ?? "",
        staffMemberIds: song.staffMemberIds ?? (song.staffMemberId ? [song.staffMemberId] : []),
        staffInstruments: song.staffInstruments ?? {},
    };
}

function normalizeSetlist(setlist: Setlist): Setlist {
    return {
        ...setlist,
        songIds: Array.isArray(setlist.songIds) ? setlist.songIds : [],
    };
}

export default Setlists;
