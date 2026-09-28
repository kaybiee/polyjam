import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useModalFocusTrap } from "./useModalFocusTrap";
import { apiFetch } from "./api";

interface Member {
    memberId: string;
    name: string;
    instrument?: string;
    instruments?: string[];
    mainInstrument?: string;
    actif: boolean;
    updatedAt?: string;
}

const instruments = ["Bass", "Batterie","Clavier", "Chant", "Flûte", "Guitare", "Saxophone", "Trompette", "Trombone", "Tuba", "Violon"];

function getMemberInstruments(member: Member) {
    const memberInstruments = [...(member.instruments ?? (member.instrument ? [member.instrument] : []))];
    return memberInstruments.sort((left, right) => {
        if (left === member.mainInstrument) return -1;
        if (right === member.mainInstrument) return 1;
        return left.localeCompare(right, "fr");
    });
}

function getAuthHeaders(): Record<string, string> {
    const accessToken = sessionStorage.getItem("polyjam-google-access-token");
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function Membres() {
    const [members, setMembers] = useState<Member[]>([]);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
    const [instrumentSearch, setInstrumentSearch] = useState("");
    const instrumentSearchRef = useRef<HTMLInputElement>(null);
    const [hoveredInstrument, setHoveredInstrument] = useState<string | null>(null);
    const [mainInstrument, setMainInstrument] = useState("");
    const [actif, setActif] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<"name" | "instrument">("name");
    const [instrumentFilter, setInstrumentFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const modalRef = useRef<HTMLElement>(null);
    const firstInstrumentOptionRef = useRef<HTMLButtonElement>(null);

    const filteredInstruments = instruments
        .filter((instrument) => !selectedInstruments.includes(instrument) && instrument.toLocaleLowerCase("fr").includes(instrumentSearch.trim().toLocaleLowerCase("fr")))
        .sort((left, right) => left.localeCompare(right, "fr"));

    useModalFocusTrap(modalRef);

    useEffect(() => {
        apiFetch("/api/members", { headers: getAuthHeaders() })
            .then((response) => {
                if (!response.ok) throw new Error();
                return response.json() as Promise<Member[]>;
            })
            .then(setMembers)
            .catch(() => setError("Impossible de charger les membres."))
            .finally(() => setLoading(false));
    }, []);

    async function saveMember(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmedFirstName = firstName.trim();
        const trimmedLastName = lastName.trim();
        const trimmedName = `${trimmedFirstName} ${trimmedLastName}`.trim();
        if (!trimmedFirstName || !trimmedLastName || /\s/.test(trimmedFirstName) || trimmedFirstName.length > 20 || trimmedLastName.length > 20 || selectedInstruments.length === 0 || (selectedInstruments.length > 1 && !mainInstrument)) return;

        setSaving(true);
        setError(null);
        setSuccess(null);
        const memberId = editingMember?.memberId ?? createMemberId(trimmedName);

        try {
            const response = await apiFetch(`/api/members/${memberId}/instrument`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify({ name: trimmedName, instruments: selectedInstruments, mainInstrument: mainInstrument || selectedInstruments[0], actif }),
            });
            if (!response.ok) {
                const details = await response.json() as { error?: string };
                throw new Error(details.error ?? "Impossible d'enregistrer ce membre.");
            }
            const savedMember = await response.json() as Member;
            setMembers((currentMembers) => [
                ...currentMembers.filter((member) => member.memberId !== savedMember.memberId),
                savedMember,
            ].sort((left, right) => left.name.localeCompare(right.name)));
            setFirstName("");
            setLastName("");
            setSelectedInstruments([]);
            setInstrumentSearch("");
            setHoveredInstrument(null);
            setMainInstrument("");
            setEditingMember(null);
            setSuccess(`${trimmedName} a été ${editingMember ? "modifié" : "ajouté"} avec succès.`);
            setIsModalOpen(false);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Impossible d'enregistrer ce membre.");
        } finally {
            setSaving(false);
        }
    }

    function openEditModal(member: Member) {
        const nameParts = member.name.trim().split(/\s+/);
        setFirstName(nameParts.shift() ?? "");
        setLastName(nameParts.join(" "));
        setSelectedInstruments(getMemberInstruments(member));
        const memberInstruments = getMemberInstruments(member);
        setMainInstrument(member.mainInstrument && memberInstruments.includes(member.mainInstrument) ? member.mainInstrument : memberInstruments.length === 1 ? memberInstruments[0] : "");
        setActif(member.actif !== false);
        setEditingMember(member);
        setIsModalOpen(true);
    }

    async function deleteMember(member: Member) {
        if (!window.confirm(`Supprimer le profil de ${member.name} ?`)) return;

        setError(null);
        setSuccess(null);
        try {
            const response = await apiFetch(`/api/members/${member.memberId}`, { method: "DELETE", headers: getAuthHeaders() });
            if (!response.ok) throw new Error();
            const result = await response.json() as { message?: string };
            setMembers((currentMembers) => currentMembers.filter((item) => item.memberId !== member.memberId));
            setSuccess(result.message ?? `${member.name} a été supprimé avec succès.`);
        } catch {
            setError("Impossible de supprimer le membre.");
        }
    }

    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("fr");
    const visibleMembers = (instrumentFilter === "all"
        ? members
        : members.filter((member) => getMemberInstruments(member).includes(instrumentFilter))
    ).filter((member) => {
        if (!normalizedSearch) return true;
        return member.name.toLocaleLowerCase("fr").includes(normalizedSearch);
    });
    const sortedMembers = [...visibleMembers].sort((left, right) => {
        const leftValue = sortMode === "name"
            ? left.name
            : getMemberInstruments(left).join(", ");
        const rightValue = sortMode === "name"
            ? right.name
            : getMemberInstruments(right).join(", ");
        return leftValue.localeCompare(rightValue, "fr") || left.name.localeCompare(right.name, "fr");
    });

    return (
        <div className="drive-document members-page">
            <div className="drive-breadcrumb">
                <Link to="/">Accueil</Link><b>›</b><span>Membres</span>
            </div>
            <div className="document-heading">
                <div>
                    <h1>Membres</h1>
                </div>
            </div>

            <button className="member-add-button" type="button" onClick={() => {
                setEditingMember(null);
                setFirstName("");
                setLastName("");
                setSelectedInstruments([]);
                setInstrumentSearch("");
                setHoveredInstrument(null);
                setMainInstrument("");
                setActif(true);
                setIsModalOpen(true);
            }}>
                <span aria-hidden="true">＋</span> Ajouter un membre
            </button>

            <div className="member-sort">
                <label className="search-label" htmlFor="member-search">Recherche</label>
                <input
                    className="member-search"
                    id="member-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    maxLength={20}
                    placeholder="Nom du membre"
                />
                <label htmlFor="member-sort-select">Trier par</label>
                <select id="member-sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as "name" | "instrument")}>
                    <option value="name">Ordre alphabétique</option>
                    <option value="instrument">Instrument</option>
                </select>
                <label htmlFor="member-instrument-filter">Filtrer</label>
                <select id="member-instrument-filter" value={instrumentFilter} onChange={(event) => setInstrumentFilter(event.target.value)}>
                    <option value="all">Tous les instruments</option>
                    {instruments.map((option) => <option key={option}>{option}</option>)}
                </select>
            </div>

            {isModalOpen && (
                <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsModalOpen(false)}>
                    <section ref={modalRef} className="member-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="modal-heading">
                            <div>
                                <p className="eyebrow">{editingMember ? "Modifier le profil" : "Nouveau profil"}</p>
                                <h2 id="member-modal-title">{editingMember ? "Modifier un membre" : "Ajouter un membre"}</h2>
                            </div>
                            <button className="modal-close" type="button" onClick={() => setIsModalOpen(false)} aria-label="Fermer">×</button>
                        </div>
                        <form className="member-form" onSubmit={saveMember}>
                            <div>
                                <label htmlFor="member-first-name">Prénom</label>
                                <input id="member-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value.replace(/\s/g, ""))} maxLength={20} required autoFocus />
                            </div>
                            <div>
                                <label htmlFor="member-last-name">Nom</label>
                                <input id="member-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={20} required />
                            </div>
                            <div>
                                <label htmlFor="member-instrument">Instrument</label>
                                <div className="instrument-picker">
                                    {selectedInstruments.map((option) => (
                                        <button className="instrument-chip" type="button" key={option} onClick={() => { setSelectedInstruments((current) => current.filter((item) => item !== option)); if (mainInstrument === option) setMainInstrument(""); }}>
                                            {option} <span aria-hidden="true">×</span>
                                        </button>
                                    ))}
                                    <input ref={instrumentSearchRef} id="member-instrument" className="staff-search" value={instrumentSearch} onChange={(event) => { setInstrumentSearch(event.target.value); setHoveredInstrument(null); }} onKeyDown={(event) => { const selected = filteredInstruments.find((option) => option === hoveredInstrument) ?? filteredInstruments[0]; if (event.key === "Tab" && instrumentSearch.trim() && selected) { event.preventDefault(); firstInstrumentOptionRef.current?.focus(); return; } if (event.key === "Enter" && selected) { event.preventDefault(); setSelectedInstruments((current) => [...current, selected]); setInstrumentSearch(""); setHoveredInstrument(null); requestAnimationFrame(() => instrumentSearchRef.current?.focus()); } }} placeholder="Rechercher un instrument" autoComplete="off" />
                                    <div className="staff-options" role="listbox" aria-label="Instruments">
                                        {filteredInstruments.map((option, index) => <button ref={index === 0 ? firstInstrumentOptionRef : undefined} className={`staff-option${(hoveredInstrument ?? filteredInstruments[0]) === option ? " highlighted" : ""}`} tabIndex={instrumentSearch.trim() ? 0 : -1} type="button" key={option} onMouseEnter={() => setHoveredInstrument(option)} onMouseLeave={() => setHoveredInstrument(null)} onClick={() => { setSelectedInstruments((current) => [...current, option]); setInstrumentSearch(""); setHoveredInstrument(null); requestAnimationFrame(() => instrumentSearchRef.current?.focus()); }}>{option}</button>)}
                                    </div>
                                </div>
                            </div>
                            {selectedInstruments.length > 1 && <div>
                                <label htmlFor="member-main-instrument">Instrument principal</label>
                                <select id="member-main-instrument" value={mainInstrument} onChange={(event) => setMainInstrument(event.target.value)} required>
                                    <option value="">Choisissez l'instrument principal</option>
                                    {selectedInstruments.map((option) => <option key={option}>{option}</option>)}
                                </select>
                            </div>}
                            <div>
                                <label htmlFor="member-status">Statut</label>
                                <select id="member-status" value={actif ? "actif" : "ancien"} onChange={(event) => setActif(event.target.value === "actif")}>
                                    <option value="actif">Actif</option>
                                    <option value="ancien">Ancien</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button className="modal-cancel" type="button" onClick={() => setIsModalOpen(false)}>Annuler</button>
                                <button className="member-save-button" type="submit" disabled={saving || selectedInstruments.length === 0}>{saving ? "Enregistrement..." : editingMember ? "Enregistrer" : "Créer le profil"}</button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {error && <p className="members-error">{error}</p>}
            {success && <p className="members-success">{success}</p>}
            {loading ? <p className="status-message">Chargement des membres...</p> : (
                <div className="members-grid members-list">
                    {sortedMembers.length > 0 ? sortedMembers.map((member) => (
                        <article className="member-card" key={member.memberId}>
                            <div className="member-avatar">{member.name.charAt(0).toUpperCase()}</div>
                            <div className="member-card-content">
                                <div className="member-card-heading">
                                    <strong>{member.name}</strong>
                                    <span className={`member-status ${member.actif === false ? "member-status-old" : "member-status-active"}`}>
                                        {member.actif === false ? "Ancien" : "Actif"}
                                    </span>
                                </div>
                                <div className="member-instruments">
                                    {getMemberInstruments(member).map((option) => <span className={`instrument-chip${member.mainInstrument === option || (!member.mainInstrument && getMemberInstruments(member).length === 1) ? " main-instrument" : ""}`} key={option}>{option}</span>)}
                                </div>
                                <div className="member-card-actions">
                                    <button className="member-edit-button" type="button" onClick={() => openEditModal(member)} aria-label={`Modifier ${member.name}`} title="Modifier">✎</button>
                                    <button className="member-delete-button" type="button" onClick={() => deleteMember(member)} aria-label={`Supprimer ${member.name}`} title="Supprimer">🗑</button>
                                </div>
                            </div>
                        </article>
                    )) : <p className="empty-members">Aucun membre pour le moment.</p>}
                </div>
            )}
        </div>
    );
}

function createMemberId(name: string) {
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${slug || "membre"}-${crypto.randomUUID()}`;
}

export default Membres;
