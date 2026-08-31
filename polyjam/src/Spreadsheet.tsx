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
}

function Spreadsheet({ url }: SpreadsheetProps) {
    const [data, setData] = useState<DateEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        readSpreadsheet();
    }, [url]);

    const readSpreadsheet = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch the Excel file
            const response = await fetch(url);

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
        } catch (err) {
            console.error(err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to read spreadsheet."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {loading && (
                <p>Loading spreadsheet...</p>
            )}

            {error && (
                <div>
                    <p style={{ color: "red" }}>
                        {error}
                    </p>
                </div>
            )}

            {!loading &&
                !error &&
                data.map((entry, index) => (
                    <div
                        key={`${entry.date}-${index}`}
                        style={{
                            marginBottom: "30px",
                            padding: "15px",
                            border: "1px solid #ccc",
                            borderRadius: "8px",
                        }}
                    >
                        <h2>{entry.date}</h2>

                        {entry.event && (
                            <p>
                                <strong>
                                    Event:
                                </strong>{" "}
                                {entry.event}
                            </p>
                        )}

                        {entry.people.map(
                            (person) => (
                                <div
                                    key={
                                        person.name
                                    }
                                    style={{
                                        display:
                                            "flex",
                                        gap: "20px",
                                        padding:
                                            "5px 0",
                                    }}
                                >
                                    <strong
                                        style={{
                                            width:
                                                "120px",
                                        }}
                                    >
                                        {
                                            person.name
                                        }
                                    </strong>

                                    <span>
                                        {person.availability ||
                                            "—"}
                                    </span>
                                </div>
                            )
                        )}
                    </div>
                ))}
        </div>
    );
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