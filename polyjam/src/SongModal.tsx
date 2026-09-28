import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useModalFocusTrap } from "./useModalFocusTrap";

interface Member {
    memberId: string;
    name: string;
    actif: boolean;
    instruments?: string[];
    mainInstrument?: string;
}

interface SongOption {
    songId: string;
    title: string;
    artist: string;
}

export interface SongDraft {
    title: string;
    artist: string;
    staffMemberIds: string[];
    staffInstruments: Record<string, string>;
}

interface SongModalProps {
    members: Member[];
    existingSongs?: SongOption[];
    initialSong?: SongDraft;
    initialSongId?: string;
    isEditing?: boolean;
    onClose: () => void;
    onSubmit: (draft: SongDraft, existingSongId?: string) => void | Promise<void>;
}

function getInitialStaffInstruments(song: SongDraft | undefined, availableMembers: Member[]) {
    return Object.fromEntries((song?.staffMemberIds ?? []).map((memberId) => {
        const member = availableMembers.find((item) => item.memberId === memberId);
        return [memberId, song?.staffInstruments?.[memberId] ?? member?.mainInstrument ?? member?.instruments?.[0] ?? ""];
    }));
}

function SongModal({ members, existingSongs = [], initialSong, initialSongId = "", isEditing = false, onClose, onSubmit }: SongModalProps) {
    const [title, setTitle] = useState(initialSong?.title ?? "");
    const [artist, setArtist] = useState(initialSong?.artist ?? "");
    const [staffMemberIds, setStaffMemberIds] = useState<string[]>(initialSong?.staffMemberIds ?? []);
    const [staffSearch, setStaffSearch] = useState("");
    const staffSearchRef = useRef<HTMLInputElement>(null);
    const [staffInstruments, setStaffInstruments] = useState<Record<string, string>>(() => getInitialStaffInstruments(initialSong, members));
    const [hoveredStaffId, setHoveredStaffId] = useState<string | null>(null);
    const [existingSongId, setExistingSongId] = useState(initialSongId);
    const modalRef = useRef<HTMLElement>(null);
    const firstStaffOptionRef = useRef<HTMLButtonElement>(null);

    useModalFocusTrap(modalRef);

    const filteredStaffMembers = members
        .filter((member) =>
            !staffMemberIds.includes(member.memberId) &&
            member.name.toLocaleLowerCase("fr").includes(staffSearch.trim().toLocaleLowerCase("fr"))
        )
        .sort((left, right) => {
            const leftFirstName = left.name.trim().split(/\s+/)[0] ?? "";
            const rightFirstName = right.name.trim().split(/\s+/)[0] ?? "";
            return leftFirstName.localeCompare(rightFirstName, "fr") || left.name.localeCompare(right.name, "fr");
        });

    function memberName(memberId: string) {
        return members.find((member) => member.memberId === memberId)?.name ?? "Membre introuvable";
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (existingSongId) {
            void onSubmit({ title: "", artist: "", staffMemberIds: [], staffInstruments: {} }, existingSongId);
            return;
        }
        if (!title.trim() || !artist.trim() || staffMemberIds.length === 0 || staffMemberIds.some((memberId) => !staffInstruments[memberId])) return;
        void onSubmit({ title: title.trim(), artist: artist.trim(), staffMemberIds, staffInstruments });
    }

    function selectStaff(memberId: string) {
        setStaffMemberIds((current) => [...current, memberId]);
        const member = members.find((item) => item.memberId === memberId);
        const defaultInstrument = member?.mainInstrument ?? member?.instruments?.[0] ?? "";
        setStaffInstruments((current) => ({ ...current, [memberId]: defaultInstrument }));
        setStaffSearch("");
        setHoveredStaffId(null);
        requestAnimationFrame(() => staffSearchRef.current?.focus());
    }

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section ref={modalRef} className="member-modal song-modal" role="dialog" aria-modal="true" aria-labelledby="song-modal-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="modal-heading">
                    <div>
                        <p className="eyebrow">{isEditing ? "Modifier la chanson" : "Nouvelle chanson"}</p>
                        <h2 id="song-modal-title">{isEditing ? "Modifier une chanson" : "Ajouter une chanson"}</h2>
                    </div>
                    <button className="modal-close" type="button" onClick={onClose} aria-label="Fermer">×</button>
                </div>
                <form className="member-form" onSubmit={submit}>
                    {existingSongs.length > 0 && <div>
                        <label htmlFor="existing-song">Ajouter une chanson existante</label>
                        <select id="existing-song" value={existingSongId} onChange={(event) => setExistingSongId(event.target.value)}>
                            <option value="">Nouvelle chanson</option>
                            {existingSongs.map((song) => <option key={song.songId} value={song.songId}>{song.title} - {song.artist}</option>)}
                        </select>
                    </div>}
                    {!existingSongId && <>
                        <div>
                            <label htmlFor="song-title">Titre</label>
                            <input id="song-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required autoFocus />
                        </div>
                        <div>
                            <label htmlFor="song-artist">Artiste</label>
                            <input id="song-artist" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={100} required />
                        </div>
                        <div>
                            <label htmlFor="song-staff">Staff</label>
                            <div className="instrument-picker staff-picker">
                                {staffMemberIds.map((memberId) => <div className="staff-member-selection" key={memberId}><button className="instrument-chip" type="button" onClick={() => { setStaffMemberIds((current) => current.filter((id) => id !== memberId)); setStaffInstruments((current) => { const next = { ...current }; delete next[memberId]; return next; }); }}>{memberName(memberId)} <span aria-hidden="true">×</span></button><div className="staff-instrument-options">{(members.find((member) => member.memberId === memberId)?.instruments ?? []).map((instrument) => <button className={`instrument-chip${staffInstruments[memberId] === instrument ? " main-instrument" : ""}`} type="button" key={instrument} onClick={() => setStaffInstruments((current) => ({ ...current, [memberId]: instrument }))}>{instrument}</button>)}</div></div>)}
                                <input ref={staffSearchRef} id="song-staff" className="staff-search" value={staffSearch} onChange={(event) => { setStaffSearch(event.target.value); setHoveredStaffId(null); }} onKeyDown={(event) => { const selectedStaff = filteredStaffMembers.find((member) => member.memberId === hoveredStaffId) ?? filteredStaffMembers[0]; if (event.key === "Tab" && staffSearch.trim() && selectedStaff) { event.preventDefault(); firstStaffOptionRef.current?.focus(); return; } if (event.key === "Enter" && selectedStaff) { event.preventDefault(); selectStaff(selectedStaff.memberId); } }} placeholder="Rechercher un membre du staff" autoComplete="off" />
                                <div className="staff-options" role="listbox" aria-label="Membres du staff">
                                    {filteredStaffMembers.map((member, index) => <button ref={index === 0 ? firstStaffOptionRef : undefined} className={`staff-option${(hoveredStaffId ?? filteredStaffMembers[0]?.memberId) === member.memberId ? " highlighted" : ""}`} tabIndex={staffSearch.trim() ? 0 : -1} type="button" key={member.memberId} onMouseEnter={() => setHoveredStaffId(member.memberId)} onMouseLeave={() => setHoveredStaffId(null)} onClick={() => selectStaff(member.memberId)}>{member.name}</button>)}
                                </div>
                            </div>
                        </div>
                    </>}
                    <div className="modal-actions">
                        <button className="modal-cancel" type="button" onClick={onClose}>Annuler</button>
                        <button className="member-save-button" type="submit">{existingSongId ? "Ajouter à la setlist" : isEditing ? "Enregistrer" : "Ajouter"}</button>
                    </div>
                </form>
            </section>
        </div>
    );
}

export default SongModal;
