import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

interface Member {
    memberId: string;
    name: string;
    instrument?: string;
    instruments?: string[];
    updatedAt?: string;
}

const instruments = ["Bass", "Batterie","Clavier", "Chant", "Flûte", "Guitare", "Saxophone", "Trompette", "Trombone", "Tuba", "Violon"];

function getMemberInstruments(member: Member) {
    return [...(member.instruments ?? (member.instrument ? [member.instrument] : []))].sort((left, right) => left.localeCompare(right, "fr"));
}

function Membres() {
    const [members, setMembers] = useState<Member[]>([]);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<"name" | "instrument">("name");
    const [instrumentFilter, setInstrumentFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetch("/api/members")
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
        const trimmedName = `${firstName.trim()} ${lastName.trim()}`.trim();
        if (!trimmedName || selectedInstruments.length === 0) return;

        setSaving(true);
        setError(null);
        setSuccess(null);
        const memberId = editingMember?.memberId ?? createMemberId(trimmedName);

        try {
            const response = await fetch(`/api/members/${memberId}/instrument`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmedName, instruments: selectedInstruments }),
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
        setEditingMember(member);
        setIsModalOpen(true);
    }

    async function deleteMember(member: Member) {
        if (!window.confirm(`Supprimer le profil de ${member.name} ?`)) return;

        setError(null);
        setSuccess(null);
        try {
            const response = await fetch(`/api/members/${member.memberId}`, { method: "DELETE" });
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
                    <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title" onMouseDown={(event) => event.stopPropagation()}>
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
                                <input id="member-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={50} required autoFocus />
                            </div>
                            <div>
                                <label htmlFor="member-last-name">Nom</label>
                                <input id="member-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={50} required />
                            </div>
                            <div>
                                <label htmlFor="member-instrument">Instrument</label>
                                <div className="instrument-picker">
                                    {selectedInstruments.map((option) => (
                                        <button className="instrument-chip" type="button" key={option} onClick={() => setSelectedInstruments((current) => current.filter((item) => item !== option))}>
                                            {option} <span aria-hidden="true">×</span>
                                        </button>
                                    ))}
                                    <select id="member-instrument" value="" onChange={(event) => setSelectedInstruments((current) => current.includes(event.target.value) ? current : [...current, event.target.value])}>
                                        <option value="">Choisissez un instrument</option>
                                        {instruments.filter((option) => !selectedInstruments.includes(option)).map((option) => <option key={option}>{option}</option>)}
                                    </select>
                                </div>
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
                                <strong>{member.name}</strong>
                                <div className="member-instruments">
                                    {getMemberInstruments(member).map((option) => <span className="instrument-chip" key={option}>{option}</span>)}
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
