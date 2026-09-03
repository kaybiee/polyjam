import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { validateSpreadsheetFormat } from "./spreadsheetFormat";

interface Member {
    memberId: string;
    name: string;
    instrument?: string;
    instruments?: string[];
    actif: boolean;
}

interface Person {
    name: string;
    availability: string;
}

interface DateEntry {
    date: string;
    event: string;
    people: Person[];
}

interface SpreadsheetProps {
    url: string;
    accessToken?: string;
    onTokenExpired: () => void;
}

function Spreadsheet({ url, accessToken, onTokenExpired }: SpreadsheetProps) {
    const [data, setData] = useState<DateEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [monthCursor, setMonthCursor] = useState("");
    const [members, setMembers] = useState<Member[]>([]);

    useEffect(() => {
        readSpreadsheet();
        fetch("/api/members", {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        })
            .then((response) => response.ok ? response.json() as Promise<Member[]> : [])
            .then(setMembers)
            .catch(() => setMembers([]));
    }, [url, accessToken]);

    const readSpreadsheet = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch the values directly from the Google Sheets API.
            const response = await fetch(
                url,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : undefined
            );

            if (!response.ok) {
                if (response.status === 401) {
                    onTokenExpired();
                    return;
                }
                const details = await response.json().catch(() => null) as {
                    error?: { message?: string };
                } | null;
                throw new Error(
                    details?.error?.message
                        ? `Impossible de charger le tableau : ${details.error.message}`
                        : `Impossible de charger le tableau : ${response.status} ${response.statusText}`
                );
            }

            const rows = await validateSpreadsheetFormat(response);

            // Row 5 = header
            const headerRowIndex = 4;
            const headerRow = rows[headerRowIndex];


            /*
             * Column A = Date
             * Column B = Event
             * Columns C onward = people
             */
            const personColumns: {
                index: number;
                name: string;
            }[] = [];

            for (let i = 2; i < headerRow.length; i++) {
                const name = String(
                    headerRow[i]
                ).trim();

                if (name !== "") {
                    personColumns.push({
                        index: i,
                        name,
                    });
                }
            }


            const parsedData: DateEntry[] = [];

            // Start at row 6
            for (
                let rowIndex = headerRowIndex + 1;
                rowIndex < rows.length;
                rowIndex++
            ) {
                const row = rows[rowIndex];

                if (!Array.isArray(row) || !row[0]) {
                    continue;
                }

                const date = parseSheetDate(row[0]);

                if (!date) {
                    continue;
                }

                const event = String(
                    row[1] ?? ""
                ).trim();

                const people: Person[] =
                    personColumns.map(
                        ({ index, name }) => ({
                            name,
                            availability:
                                String(
                                    row[index] ?? ""
                                ).trim(),
                        })
                    );

                parsedData.push({
                    date,
                    event,
                    people,
                });
            }

            setData(parsedData);
            setSelectedDate(parsedData[0]?.date ?? null);
            setMonthCursor(parsedData[0]?.date.slice(0, 7) ?? "");
        } catch (err) {
            console.error(err);

            setError(
                err instanceof TypeError
                    ? "Impossible de charger le tableau. Vérifiez qu'il est partagé publiquement ou publié sur le Web."
                    : err instanceof Error
                    ? err.message
                    : "Failed to read spreadsheet."
            );
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <p className="status-message">Chargement des disponibilités...</p>;
    }

    if (error) {
        return <p className="status-message error-message">{error}</p>;
    }

    const entriesByDate = new Map(data.map((entry) => [entry.date, entry]));
    const maximumAvailability = Math.max(
        ...data.map((entry) => getAvailablePeople(entry).length),
        1
    );
    const monthDate = new Date(`${monthCursor}-01T12:00:00`);
    const daysInMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0
    ).getDate();
    const leadingDays = (monthDate.getDay() + 6) % 7;
    const calendarCells = Array.from(
        { length: leadingDays + daysInMonth },
        (_, index) => {
            if (index < leadingDays) return null;
            const day = index - leadingDays + 1;
            return `${monthCursor}-${String(day).padStart(2, "0")}`;
        }
    );
    const selectedEntry = selectedDate
        ? entriesByDate.get(selectedDate)
        : undefined;
    const selectedPeople = selectedEntry
        ? getAvailablePeople(selectedEntry)
        : [];
    const today = formatIsoDate(new Date());
    const monthLabel = monthDate.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
    });
    const memberLabels = createMemberLabels(members);

    function changeMonth(offset: number) {
        const nextMonth = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + offset,
            1
        );
        setMonthCursor(
            `${nextMonth.getFullYear()}-${String(
                nextMonth.getMonth() + 1
            ).padStart(2, "0")}`
        );
    }

    function goToToday() {
        setMonthCursor(today.slice(0, 7));
        setSelectedDate(today);
    }

    return (
        <div className="availability-view">
            <div className="calendar-toolbar">
                <div>
                    <p className="eyebrow">Calendrier des disponibilités</p>
                    <h2>{monthLabel}</h2>
                </div>
                <div className="month-controls">
                    <button className="today-button" type="button" onClick={goToToday}>
                        Aujourd'hui
                    </button>
                    <button type="button" onClick={() => changeMonth(-1)} aria-label="Mois précédent">
                        <span className="month-arrow" aria-hidden="true">&#8592;</span>
                    </button>
                    <button type="button" onClick={() => changeMonth(1)} aria-label="Mois suivant">
                        <span className="month-arrow" aria-hidden="true">&#8594;</span>
                    </button>
                </div>
            </div>

            <div className="heatmap-legend" aria-label="Légende des disponibilités">
                <span>Moins de personnes</span>
                <i className="legend-swatch level-1" />
                <i className="legend-swatch level-2" />
                <i className="legend-swatch level-3" />
                <i className="legend-swatch level-4" />
                <span>Plus de personnes</span>
            </div>

            <div className="calendar-grid">
                {weekdays.map((weekday) => (
                    <span className="weekday" key={weekday}>{weekday}</span>
                ))}
                {calendarCells.map((date, index) => {
                    const entry = date ? entriesByDate.get(date) : undefined;
                    const availableCount = entry
                        ? getAvailablePeople(entry).length
                        : 0;
                    const level = availableCount === 0
                        ? 0
                        : Math.ceil((availableCount / maximumAvailability) * 4);

                    return date ? (
                        <button
                            className={`calendar-day level-${level}${selectedDate === date ? " selected" : ""}${today === date ? " today" : ""}`}
                            key={date}
                            type="button"
                            onClick={() => setSelectedDate(date)}
                            aria-label={`${formatDate(date)}${today === date ? ", aujourd'hui" : ""}, ${formatAvailableCount(availableCount)}`}
                        >
                            <span>{Number(date.slice(-2))}</span>
                            <strong>{availableCount}</strong>
                        </button>
                    ) : (
                        <span className="calendar-day empty" key={`empty-${index}`} />
                    );
                })}
            </div>

            <section className="date-details" aria-live="polite">
                {selectedDate ? (
                    <>
                        <div className="details-heading">
                            <div>
                                <p className="eyebrow">Date sélectionnée</p>
                                <h2>{formatDate(selectedDate)}</h2>
                            </div>
                            <span className="availability-count">{formatAvailableCount(selectedPeople.length)}</span>
                        </div>
                        {selectedEntry?.event && <p className="event-label">{selectedEntry.event}</p>}
                        <div className="people-list">
                            {selectedPeople.length > 0 ? selectedPeople.map((person) => (
                                <div className="person-row" key={person.name}>
                                    <span className="person-dot" />
                                    <strong>{getPersonDisplayName(person.name, members, memberLabels)}</strong>
                                    <span className="person-availability">{person.availability}</span>
                                    <PersonProfileDetails name={person.name} members={members} memberLabels={memberLabels} />
                                </div>
                            )) : <p>Aucune disponibilité enregistrée pour cette date.</p>}
                        </div>
                        <Link className="primary-action practice-action" to={`/pratique?date=${selectedDate}`}>Ouvrir la pratique</Link>
                    </>
                ) : <p>Sélectionnez une date pour voir les personnes disponibles.</p>}
            </section>
        </div>
    );
}

const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getAvailablePeople(entry: DateEntry) {
    return entry.people.filter((person) => availabilityScore(person.availability) > 0);
}

function getMemberInstruments(member: Member) {
    return [...(member.instruments ?? (member.instrument ? [member.instrument] : []))]
        .sort((left, right) => left.localeCompare(right, "fr"));
}

function normalizeName(name: string) {
    return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ");
}

function getNameParts(name: string) {
    const parts = name.trim().split(/\s+/);
    return {
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
    };
}

function createMemberLabels(members: Member[]) {
    const groups = new Map<string, Member[]>();
    members.forEach((member) => {
        const { firstName } = getNameParts(member.name);
        const key = normalizeName(firstName);
        groups.set(key, [...(groups.get(key) ?? []), member]);
    });

    const labels = new Map<string, string>();
    groups.forEach((group) => {
        group.forEach((member) => {
            const { firstName, lastName } = getNameParts(member.name);
            if (group.length === 1 || !lastName) {
                labels.set(member.memberId, member.name);
                return;
            }

            let label = member.name;
            for (let length = 1; length <= lastName.length; length++) {
                const candidate = `${firstName} ${lastName.slice(0, length)}`;
                const candidateKey = normalizeName(candidate);
                const matches = group.filter((otherMember) => {
                    const otherParts = getNameParts(otherMember.name);
                    return normalizeName(`${otherParts.firstName} ${otherParts.lastName.slice(0, length)}`) === candidateKey;
                });
                if (matches.length === 1) {
                    label = candidate;
                    break;
                }
            }
            labels.set(member.memberId, label);
        });
    });
    return labels;
}

function findMember(name: string, members: Member[], labels: Map<string, string>) {
    const nameKey = normalizeName(name);
    const exactMember = members.find((member) => normalizeName(member.name) === nameKey);
    if (exactMember) return exactMember;

    const labeledMember = members.find((member) => normalizeName(labels.get(member.memberId) ?? "") === nameKey);
    if (labeledMember) return labeledMember;

    const { firstName } = getNameParts(name);
    const firstNameMatches = members.filter((member) => normalizeName(getNameParts(member.name).firstName) === normalizeName(firstName));
    return firstNameMatches.length === 1 ? firstNameMatches[0] : undefined;
}

function getPersonDisplayName(name: string, members: Member[], labels: Map<string, string>) {
    const member = findMember(name, members, labels);
    return member?.name ?? name;
}

function PersonProfileDetails({ name, members, memberLabels }: { name: string; members: Member[]; memberLabels: Map<string, string> }) {
    const member = findMember(name, members, memberLabels);
    const memberInstruments = member ? getMemberInstruments(member) : [];

    if (memberInstruments.length === 0) {
        return (
            <span className="person-instruments missing">
                <Link to="/membres">Instrument à renseigner dans Membres</Link>
            </span>
        );
    }

    return (
        <span className="person-instruments">
            {memberInstruments.map((instrument) => <span className="instrument-chip" key={instrument}>{instrument}</span>)}
        </span>
    );
}

function availabilityScore(value: string) {
    const normalized = value.toLowerCase();
    if (!normalized || normalized.includes("non")) return 0;
    if (normalized.includes("moitié")) return 0.5;
    return normalized.includes("oui") || normalized.includes("disponible") ? 1 : 0;
}

function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function formatIsoDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;
}

function formatUtcIsoDate(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
        date.getUTCDate()
    ).padStart(2, "0")}`;
}

function formatAvailableCount(count: number) {
    return `${count} personne${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"}`;
}

function parseSheetDate(
    value: unknown
): string | null {
    if (
        value instanceof Date &&
        !isNaN(value.getTime())
    ) {
        const year =
            value.getFullYear();

        const month = String(
            value.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            value.getDate()
        ).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    if (typeof value === "number") {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + value * 86400000);
        return formatUtcIsoDate(date);
    }

    if (typeof value === "string") {
        const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (match) {
            return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
        }

        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return formatIsoDate(date);
        }
    }

    return null;
}

export default Spreadsheet;