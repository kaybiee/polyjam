import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

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
}

function Spreadsheet({ url, accessToken }: SpreadsheetProps) {
    const [data, setData] = useState<DateEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [monthCursor, setMonthCursor] = useState("");

    useEffect(() => {
        readSpreadsheet();
    }, [url, accessToken]);

    const readSpreadsheet = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch the Excel file
            const response = await fetch(
                url,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : undefined
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch spreadsheet: ${response.status} ${response.statusText}`
                );
            }

            // Get the file as binary data
            const buffer = await response.arrayBuffer();

            // Read Excel workbook
            const workbook = XLSX.read(buffer, {
                type: "array",
                cellDates: true,
            });

            // Get the Dispos sheet
            const worksheet = workbook.Sheets["Dispos"];

            if (!worksheet) {
                throw new Error(
                    'Could not find the "Dispos" sheet.'
                );
            }

            // Convert sheet to rows
            const rows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: "",
                raw: true,
            }) as unknown[][];

            // Row 5 = header
            const headerRowIndex = 4;
            const headerRow = rows[headerRowIndex];

            if (!headerRow) {
                throw new Error(
                    "Could not find the header row."
                );
            }

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

                if (!row || !row[0]) {
                    continue;
                }

                const date = parseExcelDate(row[0]);

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

    return (
        <div className="availability-view">
            <div className="calendar-toolbar">
                <div>
                    <p className="eyebrow">Carte des disponibilités</p>
                    <h2>{monthLabel}</h2>
                </div>
                <div className="month-controls">
                    <button type="button" onClick={() => changeMonth(-1)} aria-label="Mois précédent">
                        &#8592;
                    </button>
                    <button type="button" onClick={() => changeMonth(1)} aria-label="Mois suivant">
                        &#8594;
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
                                    <strong>{person.name}</strong>
                                    <span>{person.availability}</span>
                                </div>
                            )) : <p>Aucune disponibilité enregistrée pour cette date.</p>}
                        </div>
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

function formatAvailableCount(count: number) {
    return `${count} personne${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"}`;
}

function parseExcelDate(
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
        const date =
            XLSX.SSF.parse_date_code(
                value
            );

        if (!date) {
            return null;
        }

        return `${date.y}-${String(
            date.m
        ).padStart(2, "0")}-${String(
            date.d
        ).padStart(2, "0")}`;
    }

    return null;
}

export default Spreadsheet;