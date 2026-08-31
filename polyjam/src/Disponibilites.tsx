import Spreadsheet from "./Spreadsheet";

function Dispo() {
    const spreadsheetUrl =
    "https://docs.google.com/spreadsheets/d/1SFbspBzgPUsBNlfHNLlH2SjzzNy__Fz-6ET1EiF-dJM/export?format=xlsx";

    return (
        <div>
            <h1>Disponibilités 2026-2027</h1>

            <Spreadsheet url={spreadsheetUrl} />
        </div>
    );
}

export default Dispo;