import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SongModal, { type SongDraft } from "./SongModal";

interface Member {
    memberId: string;
    name: string;
    actif: boolean;
    instruments?: string[];
    mainInstrument?: string;
}

interface Song {
    songId: string;
    title: string;
    artist: string;
    staffMemberIds: string[];
    staffInstruments: Record<string, string>;
}

function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem("polyjam-google-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function Songs() {
    const [songs, setSongs] = useState<Song[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSong, setEditingSong] = useState<Song | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<"title" | "artist">("title");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        Promise.allSettled([
            fetchCollection<Song>("/api/songs"),
            fetchCollection<Member>("/api/members"),
        ])
            .then(([songsResult, membersResult]) => {
                if (songsResult.status === "fulfilled") setSongs(songsResult.value.map(normalizeSong));
                else setError("Impossible de charger les chansons.");
                if (membersResult.status === "fulfilled") setMembers(membersResult.value);
            })
            .finally(() => setLoading(false));
    }, []);

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

    function closeModal() {
        setIsModalOpen(false);
        setEditingSong(null);
    }

    function openAddModal() {
        setEditingSong(null);
        setIsModalOpen(true);
    }

    function openEditModal(song: Song) {
        setEditingSong(song);
        setIsModalOpen(true);
    }

    async function addSong({ title, artist, staffMemberIds, staffInstruments }: SongDraft) {
        if (!title || !artist || staffMemberIds.length === 0 || staffMemberIds.some((memberId) => !staffInstruments[memberId])) return;
        setError(null);
        setSuccess(null);
        const song = { songId: editingSong?.songId ?? crypto.randomUUID(), title: title.trim(), artist: artist.trim(), staffMemberIds, staffInstruments };
        try {
            const response = await fetch(`/api/songs/${song.songId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify(song),
            });
            if (!response.ok) throw new Error();
            const savedSong = await response.json() as Song;
            setSongs((current) => [...current.filter((item) => item.songId !== savedSong.songId), savedSong].sort((left, right) => left.title.localeCompare(right.title)));
            setSuccess(`${savedSong.title} a été ${editingSong ? "modifiée" : "ajoutée"} avec succès.`);
            closeModal();
        } catch {
            setError("Impossible d'enregistrer la chanson.");
        }
    }

    async function deleteSong(song: Song) {
        if (!window.confirm(`Supprimer la chanson ${song.title} ?`)) return;
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch(`/api/songs/${song.songId}`, { method: "DELETE", headers: getAuthHeaders() });
            if (!response.ok) throw new Error();
            setSongs((current) => current.filter((item) => item.songId !== song.songId));
            setSuccess(`${song.title} a été supprimée avec succès.`);
        } catch {
            setError("Impossible de supprimer la chanson.");
        }
    }

    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("fr");
    const visibleSongs = songs.filter((song) => !normalizedSearch
        || song.title.toLocaleLowerCase("fr").includes(normalizedSearch)
        || song.artist.toLocaleLowerCase("fr").includes(normalizedSearch)
        || song.staffMemberIds.some((memberId) => memberName(memberId).toLocaleLowerCase("fr").includes(normalizedSearch))
    );
    const sortedSongs = [...visibleSongs].sort((left, right) => {
        const leftValue = sortMode === "title" ? left.title : left.artist;
        const rightValue = sortMode === "title" ? right.title : right.artist;
        return leftValue.localeCompare(rightValue, "fr") || left.title.localeCompare(right.title, "fr");
    });

    return (
        <div className="drive-document songs-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><span>Chansons</span></div>
            <div className="document-heading"><div><h1>Chansons</h1></div></div>
            {error && <p className="members-error">{error}</p>}
            {success && <p className="members-success">{success}</p>}
            <button className="member-add-button" type="button" onClick={openAddModal}>＋ Ajouter une chanson</button>
            <div className="member-sort song-sort">
                <label className="search-label" htmlFor="song-search">Recherche</label>
                <input className="member-search" id="song-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Titre, artiste ou staff" />
                <label htmlFor="song-sort-select">Trier par</label>
                <select id="song-sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as "title" | "artist")}>
                    <option value="title">Titre</option>
                    <option value="artist">Artiste</option>
                </select>
            </div>
            {loading ? <p className="status-message">Chargement des chansons...</p> : (
                <div className="songs-list">
                    <div className="song-list-header" aria-hidden="true"><span>Titre</span><span>Artiste</span><span>Staff</span><span></span></div>
                    {sortedSongs.length > 0 ? sortedSongs.map((song) => (
                        <article className="song-card" key={song.songId}>
                            <strong>{song.title}</strong>
                            <span>{song.artist}</span>
                            <span>{memberNames(song.staffMemberIds, song.staffInstruments)}</span>
                            <div className="song-card-actions">
                                <button className="member-edit-button" type="button" onClick={() => openEditModal(song)} aria-label={`Modifier ${song.title}`} title="Modifier">✎</button>
                                <button className="member-delete-button" type="button" onClick={() => deleteSong(song)} aria-label={`Supprimer ${song.title}`} title="Supprimer">🗑</button>
                            </div>
                        </article>
                    )) : <p className="empty-members">{songs.length > 0 ? "Aucune chanson ne correspond à la recherche." : "Aucune chanson pour le moment."}</p>}
                </div>
            )}
            {isModalOpen && <SongModal key={editingSong?.songId ?? "new"} members={members} initialSong={editingSong ?? undefined} isEditing={Boolean(editingSong)} onClose={closeModal} onSubmit={addSong} />}
        </div>
    );
}

async function fetchCollection<T>(url: string): Promise<T[]> {
    const response = await fetch(url, { headers: getAuthHeaders() });
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

export default Songs;
